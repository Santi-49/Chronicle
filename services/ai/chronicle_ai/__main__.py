"""Executable entry point used by the packaged desktop sidecar."""

import sys

import uvicorn

from chronicle_ai.main import app


def verify_provider_imports() -> None:
    """Fail fast when a shipped provider was omitted from the frozen bundle."""

    from langchain_anthropic import ChatAnthropic
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
    from langchain_openai import ChatOpenAI, OpenAIEmbeddings

    provider_types = (
        ChatGoogleGenerativeAI,
        GoogleGenerativeAIEmbeddings,
        ChatOpenAI,
        OpenAIEmbeddings,
        ChatAnthropic,
    )
    print("Provider imports passed: " + ", ".join(item.__module__ for item in provider_types))


def main() -> None:
    """Run the loopback-only service on Chronicle's fixed local port."""

    if "--check-provider-imports" in sys.argv[1:]:
        verify_provider_imports()
        return

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8765,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
