import sqlite3

import pytest

from agent_system.memory import MemoryStore


def track_connections(monkeypatch, factory=sqlite3.Connection):
    connect = sqlite3.connect
    connections = []

    def tracked_connect(*args, **kwargs):
        conn = connect(*args, **kwargs, factory=factory)
        connections.append(conn)  # Keep alive so garbage collection cannot hide a leak.
        return conn

    monkeypatch.setattr(sqlite3, "connect", tracked_connect)
    return connections


def assert_closed(connections):
    assert connections
    for conn in connections:
        with pytest.raises(sqlite3.ProgrammingError, match="closed database"):
            conn.execute("SELECT 1")


def test_store_closes_connections_after_reads_and_writes(tmp_path, monkeypatch):
    connections = track_connections(monkeypatch)
    store = MemoryStore(tmp_path / "state.db")
    store.remember("key", "value")
    assert store.recall()[0]["value"] == "value"
    turn_id = store.record_turn(
        user_message="hello", reply="hi", mode="demo", model="test", iterations=1, trace=[]
    )
    assert store.recent_turns()[0]["id"] == turn_id
    assert store.turn(turn_id)["reply"] == "hi"
    assert store.turn(turn_id + 1) is None
    assert_closed(connections)


def test_store_rolls_back_and_closes_on_failure(tmp_path, monkeypatch):
    connections = track_connections(monkeypatch)
    store = MemoryStore(tmp_path / "state.db")
    with pytest.raises(RuntimeError, match="interrupted"), store._connect() as conn:
        conn.execute("INSERT INTO memories (key, value) VALUES ('partial', 'value')")
        raise RuntimeError("interrupted")
    assert store.recall() == []
    assert_closed(connections)


def test_store_closes_connection_when_setup_fails(tmp_path, monkeypatch):
    class FailingConnection(sqlite3.Connection):
        def execute(self, sql, *args, **kwargs):
            if sql.startswith("PRAGMA busy_timeout"):
                raise sqlite3.OperationalError("setup failed")
            return super().execute(sql, *args, **kwargs)

    connections = track_connections(monkeypatch, FailingConnection)
    with pytest.raises(sqlite3.OperationalError, match="setup failed"):
        MemoryStore(tmp_path / "state.db")
    assert_closed(connections)
