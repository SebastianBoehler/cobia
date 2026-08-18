INSERT INTO "cobia_challenges" (
  "id", "chain_id", "title", "display_goal", "policy_template", "manifest_hash"
) VALUES
  (
    'bounded-usdg-aave-supply',
    196,
    'Bounded USDG supply',
    'Supply 10 USDG to Aave V3 with a verifier-enforced receipt-token floor.',
    '{"version":1,"capabilityTemplateId":"aave-supply","parameters":{"inputToken":"0x4AE46a509f6B1d9056937Ba4500cB143933d2DC8","amount":"10"}}'::jsonb,
    '0xaa8947f768daac5548f0f6b790db4516e58e61114b935e7086b3cd4c2d79e91a'
  ),
  (
    'bounded-usdg-usdt0-exchange',
    196,
    'Verified USDG to USDt0 exchange',
    'Exchange 10 USDG for at least 9.95 USDt0 using a currently verified capability.',
    '{"version":1,"capabilityTemplateId":"exact-input-swap","parameters":{"inputToken":"0x4AE46a509f6B1d9056937Ba4500cB143933d2DC8","outputToken":"0x779Ded0c9e1022225f8E0630b35a9B54Be713736","amount":"10","minimum":"9.95"}}'::jsonb,
    '0xaa8947f768daac5548f0f6b790db4516e58e61114b935e7086b3cd4c2d79e91a'
  ),
  (
    'profitable-usdg-round-trip',
    196,
    'Profitable USDG round trip',
    'Complete an atomic round trip and finish with at least 0.000001 more USDG.',
    '{"version":1,"capabilityTemplateId":"round-trip","parameters":{"inputToken":"0x4AE46a509f6B1d9056937Ba4500cB143933d2DC8","amount":"10","minimum":"0.000001"}}'::jsonb,
    '0xaa8947f768daac5548f0f6b790db4516e58e61114b935e7086b3cd4c2d79e91a'
  );
