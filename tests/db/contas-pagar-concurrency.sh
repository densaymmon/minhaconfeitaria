#!/usr/bin/env bash
set -euo pipefail

COMMON=(psql -X -qAt -v ON_ERROR_STOP=1)
USER_ID="11111111-1111-4111-8111-111111111111"

ACCOUNT_ID="$("${COMMON[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${USER_ID}',true); SELECT public.salvar_conta_pagar('{\"descricao\":\"Conta concorrente\",\"data_emissao\":\"2026-10-15\",\"data_vencimento\":\"2026-10-20\",\"valor\":100.00}'::jsonb,NULL,'ffffffff-ffff-4fff-8fff-fffffffffff1'); COMMIT;" | tail -n 1)"
if [[ ! "${ACCOUNT_ID}" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo "Não foi possível criar a conta para o teste concorrente: ${ACCOUNT_ID}" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pay() {
  local op="$1"
  "${COMMON[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${USER_ID}',true); SELECT public.registrar_pagamento_conta_pagar('${ACCOUNT_ID}'::uuid,70,'2026-10-15','pix',NULL,'${op}'::uuid); COMMIT;"
}

set +e
pay "ffffffff-ffff-4fff-8fff-fffffffffff2" >"$TMP/one.log" 2>&1 &
P1=$!
pay "ffffffff-ffff-4fff-8fff-fffffffffff3" >"$TMP/two.log" 2>&1 &
P2=$!
wait "$P1"; R1=$?
wait "$P2"; R2=$?
set -e

if ! { [[ $R1 -eq 0 && $R2 -ne 0 ]] || [[ $R1 -ne 0 && $R2 -eq 0 ]]; }; then
  echo "Esperava exatamente um pagamento concorrente aprovado. rc1=$R1 rc2=$R2" >&2
  cat "$TMP/one.log" "$TMP/two.log" >&2
  exit 1
fi

RESULT="$("${COMMON[@]}" -c "SELECT valor_pago::text || ':' || status FROM public.contas_pagar WHERE id='${ACCOUNT_ID}'::uuid")"
if [[ "$RESULT" != "70.00:parcial" ]]; then
  echo "Saldo incorreto após pagamentos concorrentes: $RESULT" >&2
  exit 1
fi

echo "Teste concorrente aprovado: apenas um pagamento de R$ 70 foi aceito; estado final $RESULT."
