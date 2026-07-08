# Judgment Proxy

Small HTTP service for the eLegalix PDF POST flow. Run it only from an egress
network that can successfully POST to `WebDownloadJudgmentDocument.do`; Azure
currently gets `403` for that POST.

## Run

```bash
PORT=5055 JUDGMENT_PROXY_TOKEN='change-me' node ops/judgment-proxy/server.mjs
```

## Verify

```bash
JUDGMENT_PROXY_TOKEN='change-me' \
node ops/judgment-proxy/verify.mjs http://127.0.0.1:5055/judgment
```

The verification must return `pdfHeader: "%PDF"` before production is pointed
at the proxy.

## Wire Backend

Set these in the main backend environment:

```bash
ORDERS_JUDGMENT_PROXY_URL='https://accepted-egress-host.example.com/judgment'
ORDERS_JUDGMENT_PROXY_TOKEN='change-me'
```
