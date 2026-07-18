# ============================================================================
# ⚠️ COURSE CORRECTION (2026-07-19) — DO NOT BUILD ON THIS CLASS AS-IS.
#
# This spike predates the team decisions logged in docs/challenge/RESEARCH.md
# (2026-07-19) and TODO.md MVP-09. It violates the model-agnostic rule
# (docs/spec.md §2/§6.4). Required changes before further MVP-09 work:
#
#   1. Model-agnostic: replace ChatGoogleGenerativeAI with LangChain's
#      provider-neutral factory (init_chat_model); provider/model/key are
#      per-request inputs. Gemini stays only as the default *configuration*.
#   2. Key handling: no GEMINI_API_KEY env var — the BYOK key arrives per
#      request from the Electron main process (safeStorage) over 127.0.0.1.
#   3. This code moves to services/ai/ behind FastAPI (POST /annotate);
#      the stdin/stdout CLI idea is superseded — do not implement cli.py.
#
# Keep: with_structured_output(VersionAnnotation), previous-then-current
# image ordering, temperature=0. Full migration table: ./README.md.
# ============================================================================
import base64
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI

from .schemas import VersionAnnotation


class GeminiEngine:
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash",
    ) -> None:
        if not api_key:
            raise ValueError("Gemini API key is required")

        self.model = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0,
        )

        self.structured_model = self.model.with_structured_output(
            VersionAnnotation
        )

    async def analyze(
        self,
        prompt: str,
        current_image: dict[str, Any],
        previous_image: dict[str, Any] | None = None,
    ) -> VersionAnnotation:
        content = [{"type": "text", "text": prompt}]

        if previous_image is not None:
            content.append(
                self._image_message(previous_image)
            )

        content.append(
            self._image_message(current_image)
        )

        result = await self.structured_model.ainvoke(
            [{"role": "user", "content": content}]
        )

        return VersionAnnotation.model_validate(result)

    def _image_message(self, image: dict[str, Any]) -> dict[str, Any]:
        encoded_image = base64.b64encode(image["data"]).decode("utf-8")

        return {
            "type": "image_url",
            "image_url": (
                f"data:{image['mime_type']};base64,{encoded_image}"
            ),
        }