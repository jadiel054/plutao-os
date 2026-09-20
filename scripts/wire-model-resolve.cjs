#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const route = path.join(root, "apps/web/src/app/api/chat/route.ts");
const testRoute = path.join(root, "apps/web/src/app/api/model/test/route.ts");

function must(file, oldStr, newStr, label) {
  let t = fs.readFileSync(file, "utf8");
  if (t.includes(newStr.trim().slice(0, 48))) {
    console.log("skip " + label);
    return t;
  }
  if (!t.includes(oldStr)) {
    console.error("FAIL " + label);
    process.exitCode = 1;
    return t;
  }
  t = t.replace(oldStr, newStr);
  fs.writeFileSync(file, t);
  console.log("ok " + label);
  return t;
}

// --- chat/route.ts ---
let chat = fs.readFileSync(route, "utf8");

if (!chat.includes("resolveCloudModelConfig")) {
  chat = chat.replace(
    'import { getModelConfig } from "@/lib/runtime/model/config";',
    'import { getModelConfig } from "@/lib/runtime/model/config";\nimport { resolveCloudModelConfig } from "@/lib/runtime/model/resolveConfig";'
  );
  console.log("ok chat import");
}

const oldBlock =
  "    if (userRecord?.preferredModel) {\n" +
  "      const preferred = PRESET_MODELS.find((m) => m.id === userRecord.preferredModel);\n" +
  "      if (preferred) {\n" +
  "        const isPremium = preferred.tier === \"premium\";\n" +
  "        const isAllowedByPlan = planDef.models.includes(isPremium ? \"premium\" : \"economy\");\n" +
  "        if (isAllowedByPlan) {\n" +
  "          isTargetModelPremium = isPremium;\n" +
  "          const apiKey = process.env.MODEL_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || \"\";\n" +
  "          const baseUrl = process.env.MODEL_BASE_URL?.trim() || \"https://api.openai.com/v1\";\n" +
  "          if (apiKey) {\n" +
  "            customModelConfig = {\n" +
  "              provider: \"openai\",\n" +
  "              apiKey,\n" +
  "              baseUrl,\n" +
  "              model: preferred.id,\n" +
  "            };\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }";

const newBlock =
  "    if (userRecord?.preferredModel) {\n" +
  "      const preferred = PRESET_MODELS.find((m) => m.id === userRecord.preferredModel);\n" +
  "      if (preferred) {\n" +
  "        const isPremium = preferred.tier === \"premium\";\n" +
  "        const isAllowedByPlan = planDef.models.includes(isPremium ? \"premium\" : \"economy\");\n" +
  "        if (isAllowedByPlan) {\n" +
  "          isTargetModelPremium = isPremium;\n" +
  "          const resolved = resolveCloudModelConfig(preferred.id);\n" +
  "          if (resolved.ok) {\n" +
  "            customModelConfig = resolved.config;\n" +
  "          } else {\n" +
  "            console.warn(\"[chat] preferredModel sem rota/chave:\", preferred.id, resolved.error);\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }";

if (chat.includes("model: preferred.id")) {
  if (!chat.includes(oldBlock)) {
    console.error("FAIL chat preferred block anchor");
    process.exitCode = 1;
  } else {
    chat = chat.replace(oldBlock, newBlock);
    console.log("ok chat preferred block");
  }
} else if (chat.includes("resolveCloudModelConfig(preferred.id)")) {
  console.log("skip chat preferred block");
} else {
  console.error("FAIL chat preferred: unexpected shape");
  process.exitCode = 1;
}

fs.writeFileSync(route, chat);

// --- model/test/route.ts ---
let test = fs.readFileSync(testRoute, "utf8");

if (!test.includes("resolveCloudModelConfig")) {
  test = test.replace(
    'import { getModelConfig } from "@/lib/runtime/model/config";',
    'import { getModelConfig } from "@/lib/runtime/model/config";\nimport { resolveCloudModelConfig, isLocalCatalogModel } from "@/lib/runtime/model/resolveConfig";'
  );
  console.log("ok test import");
}

const oldResolve =
  "    // Resolve model config for test call\n" +
  "    let config: ModelConfig | null = null;\n" +
  "    const apiKey = process.env.MODEL_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || \"\";\n" +
  "    const baseUrl = process.env.MODEL_BASE_URL?.trim() || \"https://api.openai.com/v1\";\n\n" +
  "    if (apiKey) {\n" +
  "      config = {\n" +
  "        provider: \"openai\",\n" +
  "        apiKey,\n" +
  "        baseUrl,\n" +
  "        model: modelId,\n" +
  "      };\n" +
  "    } else {\n" +
  "      config = getModelConfig();\n" +
  "    }\n\n" +
  "    if (!config) {\n" +
  "      return NextResponse.json({\n" +
  "        output: `[${matchedModel?.name || modelId}] Teste executado. Nota: Chave de API de nuvem não configurada no servidor.`,\n" +
  "        latencyMs: 120,\n" +
  "        tokensGenerated: 15,\n" +
  "      });\n" +
  "    }";

const newResolve =
  "    // Resolve model config for test call (id de catálogo ≠ nome na API)\n" +
  "    let config: ModelConfig | null = null;\n\n" +
  "    if (isLocalCatalogModel(modelId)) {\n" +
  "      return NextResponse.json({\n" +
  "        output: `[${matchedModel?.name || modelId}] Modelo local (WebGPU/navegador). Teste de nuvem não se aplica.`,\n" +
  "        latencyMs: 0,\n" +
  "        tokensGenerated: 0,\n" +
  "        error: \"LOCAL_MODEL\",\n" +
  "      });\n" +
  "    }\n\n" +
  "    const resolved = resolveCloudModelConfig(modelId);\n" +
  "    if (resolved.ok) {\n" +
  "      config = resolved.config;\n" +
  "    } else {\n" +
  "      // Fallback: config global do servidor (MODEL_*)\n" +
  "      config = getModelConfig();\n" +
  "      if (!config) {\n" +
  "        return NextResponse.json({\n" +
  "          output: `[${matchedModel?.name || modelId}] ${resolved.error}`,\n" +
  "          latencyMs: 0,\n" +
  "          tokensGenerated: 0,\n" +
  "          error: resolved.error,\n" +
  "          missingEnv: resolved.missingEnv,\n" +
  "        });\n" +
  "      }\n" +
  "      console.warn(\"[model/test] rota específica falhou, usando getModelConfig:\", resolved.error);\n" +
  "    }";

if (test.includes("model: modelId")) {
  if (!test.includes(oldResolve)) {
    console.error("FAIL test resolve anchor");
    process.exitCode = 1;
  } else {
    test = test.replace(oldResolve, newResolve);
    console.log("ok test resolve");
  }
} else if (test.includes("resolveCloudModelConfig(modelId)")) {
  console.log("skip test resolve");
} else {
  console.error("FAIL test resolve: unexpected shape");
  process.exitCode = 1;
}

fs.writeFileSync(testRoute, test);
console.log("wire-model-resolve done");
