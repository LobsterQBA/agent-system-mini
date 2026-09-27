from types import SimpleNamespace

import pytest

from agent_system.models import LiveModel


class FakeCompletions:
    def __init__(self, *, arguments):
        function = SimpleNamespace(name="current_time", arguments=arguments)
        call = SimpleNamespace(id="call-1", function=function)
        message = SimpleNamespace(content="", tool_calls=[call])
        self.response = SimpleNamespace(choices=[SimpleNamespace(message=message)])

    def create(self, **kwargs):
        return self.response


def fake_live_model(arguments):
    model = LiveModel.__new__(LiveModel)
    model.client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions(arguments=arguments))
    )
    model.name = "fake-live-model"
    return model


def test_live_model_parses_object_tool_arguments():
    reply = fake_live_model('{"zone":"UTC"}').complete([], [])

    assert reply.tool_calls[0].arguments == {"zone": "UTC"}


def test_live_model_rejects_malformed_tool_arguments_without_echoing_payload():
    model = fake_live_model('{"secret":"do-not-log"')

    with pytest.raises(ValueError, match="returned invalid JSON arguments") as raised:
        model.complete([], [])

    assert "do-not-log" not in str(raised.value)


@pytest.mark.parametrize("arguments", ["[]", '"text"', "null", "7"])
def test_live_model_rejects_tool_arguments_that_are_not_objects(arguments):
    model = fake_live_model(arguments)

    with pytest.raises(TypeError, match="arguments must decode to an object"):
        model.complete([], [])
