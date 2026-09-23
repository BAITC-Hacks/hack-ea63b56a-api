from typing import Any

import httpx


class BackendError(RuntimeError):
    """A safe, user-facing backend error."""


class BackendClient:
    def __init__(self, base_url: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"{base_url.rstrip('/')}/",
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers={"Accept": "application/json"},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "health")

    async def catalog(self) -> dict[str, Any]:
        return await self._request("GET", "catalog")

    async def parse_intent(self, message: str) -> dict[str, Any]:
        return await self._request("POST", "intake/parse", json={"message": message})

    async def recommendations(self, values: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "recommendations", json=values)

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = await self._client.request(method, path, **kwargs)
        except httpx.TimeoutException as exc:
            raise BackendError("Сервис подбора отвечает слишком долго. Попробуйте ещё раз.") from exc
        except httpx.HTTPError as exc:
            raise BackendError("Не удалось связаться с сервисом подбора.") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise BackendError("Сервис подбора вернул некорректный ответ.") from exc

        if response.is_error:
            raw_message = body.get("message") if isinstance(body, dict) else None
            if isinstance(raw_message, list):
                detail = "; ".join(str(item) for item in raw_message)
            elif isinstance(raw_message, str):
                detail = raw_message
            else:
                detail = "Проверьте параметры и повторите запрос."
            raise BackendError(detail)

        if not isinstance(body, dict):
            raise BackendError("Сервис подбора вернул некорректный ответ.")
        return body
