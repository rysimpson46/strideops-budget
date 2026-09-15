import { onRequestOptions as __api_check_item_status_js_onRequestOptions } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\check-item-status.js"
import { onRequestPost as __api_check_item_status_js_onRequestPost } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\check-item-status.js"
import { onRequestOptions as __api_create_link_token_js_onRequestOptions } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\create-link-token.js"
import { onRequestPost as __api_create_link_token_js_onRequestPost } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\create-link-token.js"
import { onRequestOptions as __api_exchange_token_js_onRequestOptions } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\exchange-token.js"
import { onRequestPost as __api_exchange_token_js_onRequestPost } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\exchange-token.js"
import { onRequestOptions as __api_get_transactions_js_onRequestOptions } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\get-transactions.js"
import { onRequestPost as __api_get_transactions_js_onRequestPost } from "C:\\Users\\Ryan Simpson\\OneDrive - Nutrix International\\strideops-cf\\functions\\api\\get-transactions.js"

export const routes = [
    {
      routePath: "/api/check-item-status",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_check_item_status_js_onRequestOptions],
    },
  {
      routePath: "/api/check-item-status",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_check_item_status_js_onRequestPost],
    },
  {
      routePath: "/api/create-link-token",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_create_link_token_js_onRequestOptions],
    },
  {
      routePath: "/api/create-link-token",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_create_link_token_js_onRequestPost],
    },
  {
      routePath: "/api/exchange-token",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_exchange_token_js_onRequestOptions],
    },
  {
      routePath: "/api/exchange-token",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_exchange_token_js_onRequestPost],
    },
  {
      routePath: "/api/get-transactions",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_get_transactions_js_onRequestOptions],
    },
  {
      routePath: "/api/get-transactions",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_get_transactions_js_onRequestPost],
    },
  ]