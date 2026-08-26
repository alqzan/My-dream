#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUTPUT = process.argv.includes("--json");
const SELF = "scripts/ai-doctor.mjs";

const findings = {
  critical: [],
  warning: [],
  improvement: [],
  healthy: [],
};

const skippedDirectories = new Set([
  ".git",
  ".next",
  ".firebase",
  "coverage",
  "node_modules",
  "out",
  "output",
  "tmp",
]);

const codeRoots = ["src/", "scripts/", "firebase-tests/", "cloudflare-worker/src/"];
const codeExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx", ".jsx"]);

function add(level, area, message, detail = "") {
  findings[level].push({
    area,
    message,
    detail: Array.isArray(detail) ? detail.join("، ") : detail,
  });
}

function readText(relativePath) {
  try {
    return readFileSync(join(ROOT, relativePath), "utf8");
  } catch {
    return null;
  }
}

function readJson(relativePath) {
  const text = readText(relativePath);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pathExists(relativePath) {
  return existsSync(join(ROOT, relativePath));
}

function lineNumber(text, offset) {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

function git(args) {
  return run("git", args);
}

function commandAvailable(command) {
  const result = run("which", [command], { timeout: 2000 });
  return result.status === 0;
}

function collectFiles(directory = ROOT) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    const relativePath = relative(ROOT, fullPath).split("\\").join("/");
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) files.push(...collectFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;

    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }
    if (stats.size > 2 * 1024 * 1024) continue;

    try {
      const buffer = readFileSync(fullPath);
      if (buffer.includes(0)) continue;
      files.push({ relativePath, text: buffer.toString("utf8"), size: stats.size });
    } catch {
      // A file that cannot be read is reported by the repository checks when relevant.
    }
  }
  return files;
}

function isCodeFile(relativePath) {
  return codeRoots.some((prefix) => relativePath.startsWith(prefix))
    || codeExtensions.has(extname(relativePath));
}

function allTextFiles() {
  return collectFiles();
}

function codeFiles() {
  return collectFiles().filter((file) => isCodeFile(file.relativePath));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedInstructionLine(line) {
  return line
    .toLocaleLowerCase("ar")
    .replace(/^\s*(?:[-*•>#]|\d+[.)])\s*/, "")
    .replace(/[«»“”`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checkInstructions() {
  const paths = [
    "CLAUDE.md",
    "AGENTS.md",
    ".agents/skills/project-doctor/SKILL.md",
    ".claude/skills/project-doctor/SKILL.md",
  ];
  const documents = new Map();
  const missing = [];

  for (const path of paths) {
    const text = readText(path);
    if (text === null) missing.push(path);
    else documents.set(path, text);
  }

  if (missing.length) {
    add("critical", "تعليمات الوكلاء", "ملفات التعليمات الأساسية مفقودة", missing);
    return;
  }

  const requiredAgentLines = [
    "# تعليمات Codex في مدار",
    "قبل أي عمل، اقرأ `CLAUDE.md` كاملًا؛ فهو المرجع الأساسي والملزم للمشروع.",
    "لا تسمح لوكيلين بتعديل الملفات نفسها، ولا تكرر العمل بينهم.",
    "لا تحذف بيانات، ولا تغيّر Firebase أو المزامنة أو النسخ الاحتياطي دون موافقة صريحة.",
  ];
  const agents = documents.get("AGENTS.md");
  const missingAgentLines = requiredAgentLines.filter((line) => !agents.includes(line));
  if (missingAgentLines.length) {
    add("critical", "تعليمات الوكلاء", "AGENTS.md لا يطابق العقد المطلوب", missingAgentLines);
  } else {
    add("healthy", "تعليمات الوكلاء", "CLAUDE.md وAGENTS.md وملفا المهارة موجودة");
  }

  const occurrences = new Map();
  for (const [path, text] of documents) {
    for (const line of text.split("\n")) {
      const normalized = normalizedInstructionLine(line);
      if (normalized.length < 24 || normalized.startsWith("#") || normalized.startsWith("``")) continue;
      const current = occurrences.get(normalized) ?? [];
      current.push(path);
      occurrences.set(normalized, current);
    }
  }
  const duplicates = [...occurrences.entries()]
    .filter(([, pathsForLine]) => new Set(pathsForLine).size > 1)
    .map(([line, pathsForLine]) => ({ line, paths: [...new Set(pathsForLine)] }));
  if (duplicates.length) {
    add(
      "improvement",
      "تعليمات الوكلاء",
      `وجدت ${duplicates.length} تعليماً مكرراً بين الوثائق؛ لا يوجد حذف تلقائي`,
      duplicates.slice(0, 4).map((item) => `${item.paths.join(" + ")}: ${item.line}`),
    );
  } else {
    add("healthy", "تعليمات الوكلاء", "لا يوجد تكرار حرفي مؤثر بين ملفات التعليمات");
  }

  const combined = [...documents.values()].join("\n");
  const directMain = /(?:اكتب|الكتابة) مباشرة.{0,30}main|directly on [`']?main/i.test(combined);
  const branchCreation = /(?:أنشئ|إنشاء|create|use)\s+(?:فروع|فرع|branches|branch)/i.test(combined)
    && !/لا\s+(?:تنشئ|تنشئ|إنشاء)|لا\s+create|don't\s+create/i.test(combined);
  const readOnly = /قراءة فقط|read-only|لا تعدّل|لا يصلح|لا تُصلح/i.test(combined);
  const autoFix = /(?:يصلح|يعدّل|يحذف) تلقائياً|auto[- ]?fix|automatically (?:fix|delete|write)/i.test(combined)
    && !/لا (?:يصلح|يعدّل|يحذف) تلقائياً|لا auto[- ]?fix|must not automatically/i.test(combined);

  if (directMain && branchCreation) {
    add("critical", "تعليمات الوكلاء", "إشارة إلى تعارض بين سياسة main وسياسة إنشاء الفروع");
  } else if (directMain) {
    add("healthy", "تعليمات الوكلاء", "سياسة العمل على main متسقة ولا توجد إشارة مخالفة");
  }
  if (readOnly && autoFix) {
    add("warning", "تعليمات الوكلاء", "وجدت إشارات متضادة حول القراءة فقط والإصلاح التلقائي");
  } else if (readOnly) {
    add("healthy", "تعليمات الوكلاء", "Project Doctor موصوف كفحص قراءة فقط");
  }
}

function checkScripts(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  const gates = [
    { name: "test", bin: "vitest", expected: /vitest\s+run/i },
    { name: "lint", bin: "eslint", expected: /eslint/i },
    { name: "build", bin: "next", expected: /next\s+build/i },
    { name: "test:rules", bin: "firebase", expected: /firebase\s+emulators:exec/i },
    { name: "doctor:ai", bin: "node", expected: /node\s+scripts\/ai-doctor\.mjs/i },
  ];

  for (const gate of gates) {
    const command = scripts[gate.name];
    if (!command) {
      add("critical", "بوابات الأوامر", `السكريبت npm run ${gate.name} غير موجود`);
      continue;
    }
    if (!gate.expected.test(command)) {
      add("warning", "بوابات الأوامر", `تعريف npm run ${gate.name} لا يطابق الأداة المتوقعة`, command);
    }
    const localBinary = gate.bin === "node" || existsSync(join(ROOT, "node_modules", ".bin", gate.bin));
    if (!localBinary && !commandAvailable(gate.bin)) {
      add("warning", "بوابات الأوامر", `الأداة ${gate.bin} غير متاحة محليًا لـ npm run ${gate.name}`);
    } else {
      add(
        "healthy",
        "بوابات الأوامر",
        `npm run ${gate.name} موجود والأداة متاحة`,
        "لم يُنفّذ الأمر داخل Project Doctor حتى يبقى الفحص قراءةً وتشخيصًا فقط؛ شغّله في بوابة التحقق.",
      );
    }
  }

  for (const path of ["vitest.rules.config.ts", "firebase-tests/rules.test.ts"]) {
    if (!pathExists(path)) add("warning", "بوابات الأوامر", `ملف اختبار القواعد غير موجود: ${path}`);
  }
}

function dependencyIsUsed(name, packageJson, code) {
  const escaped = escapeRegExp(name);
  const importPattern = new RegExp(
    `(?:from\\s*|import\\s*\\(|require\\s*\\(|export\\s+[^;]*from\\s*)["']${escaped}(?:["'/])`,
    "m",
  );
  const scriptUsesName = Object.values(packageJson?.scripts ?? {}).some((value) => (
    value.includes(name) || value.includes(name.split("/").at(-1))
  ));
  return importPattern.test(code) || scriptUsesName;
}

function checkDependencies(packageJson, lockJson, projectFiles) {
  if (!lockJson?.packages?.[""]) {
    add("critical", "الاعتماديات", "package-lock.json غير صالح أو لا يحتوي سجل الجذر");
    return;
  }

  const lockRoot = lockJson.packages[""];
  const code = projectFiles
    .filter((file) => isCodeFile(file.relativePath))
    .map((file) => file.text)
    .join("\n");
  const dependencySections = ["dependencies", "devDependencies"];
  const allDependencies = [];

  for (const section of dependencySections) {
    for (const [name, requested] of Object.entries(packageJson?.[section] ?? {})) {
      allDependencies.push({ name, section, requested });
      const locked = lockRoot?.[section]?.[name];
      if (locked !== requested) {
        add("warning", "الاعتماديات", `${name} غير متسق بين package.json وpackage-lock.json`, `${requested} مقابل ${locked ?? "غير موجود"}`);
      }
      const installed = existsSync(join(ROOT, "node_modules", ...name.split("/")));
      if (!installed) add("warning", "الاعتماديات", `${name} غير مثبت في node_modules`);
    }
  }

  const toolingOnly = new Set([
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "autoprefixer",
    "eslint",
    "eslint-config-next",
    "postcss",
    "tailwindcss",
    "typescript",
    "vitest",
    "firebase-tools",
    "@firebase/rules-unit-testing",
  ]);
  for (const dependency of allDependencies.filter((item) => item.section === "dependencies" && !toolingOnly.has(item.name))) {
    if (!dependencyIsUsed(dependency.name, packageJson, code)) {
      add("warning", "الاعتماديات", `${dependency.name} مرشح لاعتماد غير مستخدم؛ راجع الاستخدام قبل الحذف`);
    }
  }

  const outdated = run("npm", ["outdated", "--json", "--offline", "--no-update-notifier"], { timeout: 6000 });
  const outdatedText = (outdated.stdout ?? "").trim();
  if (outdatedText) {
    try {
      const entries = Object.entries(JSON.parse(outdatedText));
      const knownNames = new Set([
        ...Object.keys(packageJson?.dependencies ?? {}),
        ...Object.keys(packageJson?.devDependencies ?? {}),
      ]);
      const packageEntries = entries.filter(([name]) => knownNames.has(name));
      if (packageEntries.length) {
        for (const [name, info] of packageEntries.slice(0, 12)) {
          add("warning", "الاعتماديات", `${name} لديه تحديث متاح في بيانات npm المحلية`, `${info.current ?? "?"} → ${info.latest ?? info.wanted ?? "?"}`);
        }
      } else {
        add("healthy", "الاعتماديات", "لم يظهر npm outdated أي اعتماد قديم في البيانات المحلية");
      }
    } catch {
      add("improvement", "الاعتماديات", "تعذر تحليل نتيجة npm outdated المحلية؛ لم يُجرَ أي تحديث");
    }
  } else if (outdated.status === 0) {
    add("healthy", "الاعتماديات", "لم يظهر npm outdated أي اعتماد قديم في البيانات المحلية");
  } else {
    add("improvement", "الاعتماديات", "لم تتوفر بيانات npm المحلية للمقارنة؛ لم يُستخدم اتصال أو تثبيت تلقائي");
  }

  const roadmap = readText("ROADMAP.md") ?? "";
  if (/Recharts\s*3|React\/Next الرئيسية|ترقية Recharts/i.test(roadmap)) {
    add("improvement", "الاعتماديات", "الترقيات الكبرى لـ React/Next/Recharts موثقة كمؤجلة في ROADMAP؛ لا تُنفّذ تلقائيًا");
  }
  if (packageJson?.dependencies?.next?.startsWith("^15") && packageJson?.dependencies?.react?.startsWith("^18")) {
    add("improvement", "الاعتماديات", "حد React/Next الرئيسي الحالي يحتاج مراجعة منفصلة قبل أي ترقية كبرى");
  }
}

function checkSecrets(projectFiles) {
  const sensitiveName = /(?:^|\/)(?:\.env(?:\..+)?|.*(?:service[-_ ]?account|credentials|id_rsa|private[-_ ]?key).*)$/i;
  const allowedEnvironmentFiles = new Set([".env.example", ".env.sample"]);
  const tracked = (git(["ls-files"]).stdout ?? "").split("\n").filter(Boolean);
  const trackedSensitive = tracked.filter((path) => sensitiveName.test(path) && !allowedEnvironmentFiles.has(basename(path)));
  if (trackedSensitive.length) {
    add("critical", "الأسرار", "ملفات بيئة/اعتماد حساسة متتبعة في Git", trackedSensitive);
  }

  const workspaceSensitive = projectFiles
    .filter((file) => sensitiveName.test(file.relativePath) && !allowedEnvironmentFiles.has(basename(file.relativePath)))
    .map((file) => file.relativePath);
  if (workspaceSensitive.length) {
    add("warning", "الأسرار", "ملفات بيئة/اعتماد حساسة موجودة في working tree؛ لم تُعرض قيمها", workspaceSensitive);
  }

  const patterns = [
    { label: "مادة مفتاح خاص", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i, level: "critical" },
    { label: "بادئة رمز وصول أو إعداد Firebase", regex: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|xox[baprs]-[0-9A-Za-z-]{20,})\b/, level: "warning" },
    { label: "إسناد بيانات اعتماد يحتاج مراجعة", regex: /\b(?:password|secret|token|private[_-]?key)\s*[:=]\s*["'`][^"'`\n]{8,}["'`]/i, level: "warning" },
  ];
  const criticalHits = [];
  const warningHits = [];
  const fixtureHits = [];
  for (const file of projectFiles) {
    if (file.relativePath === SELF || file.relativePath.startsWith("output/") || file.relativePath.startsWith("tmp/")) continue;
    const lines = file.text.split("\n");
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (!pattern.regex.test(line)) continue;
        const hit = `${file.relativePath}:${index + 1} (${pattern.label})`;
        if (pattern.level === "critical" && !file.relativePath.includes(".test.")) criticalHits.push(hit);
        else if (file.relativePath.includes(".test.")) fixtureHits.push(hit);
        else warningHits.push(hit);
      }
    });
  }
  if (criticalHits.length) add("critical", "الأسرار", "وجدت مادة مفتاح خاص محتملة؛ عُرض المسار والتصنيف فقط دون قيمة السر", criticalHits.slice(0, 12));
  if (warningHits.length) add("warning", "الأسرار", "وجدت إعدادات أو أنماط رموز تحتاج مراجعة؛ لم تُعرض أي قيمة", warningHits.slice(0, 12));
  if (fixtureHits.length) add("improvement", "الأسرار", "وجدت قيمًا تشبه بيانات اعتماد داخل اختبارات/fixtures؛ لم تُعامل كتسريب مؤكد", fixtureHits.slice(0, 12));
  if (!criticalHits.length && !warningHits.length && !fixtureHits.length) {
    add("healthy", "الأسرار", "لم يظهر نمط مفتاح/رمز وصول معروف في الملفات المقروءة؛ القيم لا تُطبع");
  }

  const gitignore = readText(".gitignore") ?? "";
  if (/\.env\*\.local|\.env\.local/.test(gitignore)) {
    add("healthy", "الأسرار", ".gitignore يحمي ملفات البيئة المحلية");
  } else {
    add("warning", "الأسرار", ".gitignore لا يحمي .env.local بوضوح");
  }

  const firebaseSource = readText("src/lib/firebase.ts") ?? "";
  const firebaseKeyLine = firebaseSource.split("\n").findIndex((line) => /apiKey|NEXT_PUBLIC_FIREBASE/.test(line));
  if (firebaseKeyLine >= 0) {
    add("improvement", "الأسرار", `إعداد Firebase للمتصفح موجود في src/lib/firebase.ts:${firebaseKeyLine + 1}؛ راجع مصدره العام/السري دون طباعة قيمته`);
  }
}

function checkFirebase(packageJson) {
  const config = readJson("firebase.json");
  if (config === undefined) {
    add("critical", "Firebase", "firebase.json موجود لكنه غير صالح JSON");
  } else if (!config) {
    add("critical", "Firebase", "firebase.json غير موجود");
  } else {
    const firestoreRules = config.firestore?.rules;
    const storageRules = config.storage?.rules;
    if (!firestoreRules || !pathExists(firestoreRules)) add("critical", "Firebase", "مسار Firestore rules غير مضبوط أو الملف مفقود");
    if (!storageRules || !pathExists(storageRules)) add("critical", "Firebase", "مسار Storage rules غير مضبوط أو الملف مفقود");
    if (firestoreRules && storageRules && pathExists(firestoreRules) && pathExists(storageRules)) {
      add("healthy", "Firebase", "firebase.json يربط قواعد Firestore وStorage المحليتين");
    }
  }

  const firestore = readText("firestore.rules") ?? "";
  const storage = readText("storage.rules") ?? "";
  if (/REPLACED_IN_FIREBASE_CONSOLE/.test(firestore)) {
    add("warning", "Firebase", "firestore.rules قالب مرجعي؛ القواعد الإنتاجية الفعلية لا يمكن تأكيدها من المستودع حسب CLAUDE.md");
  } else {
    add("improvement", "Firebase", "لم يظهر placeholder القواعد المعتاد؛ ما زالت مطابقة الإنتاج تحتاج تحققًا من Console");
  }
  if (/allow\s+(?:read\s*,\s*write|read|write):\s*if\s+false/i.test(storage)) {
    add("healthy", "Firebase", "قواعد Storage المحلية تمنع القراءة والكتابة افتراضيًا");
  } else {
    add("warning", "Firebase", "قواعد Storage المحلية لا تبدو deny-all؛ تحتاج مراجعة بشرية");
  }

  const sourceFiles = codeFiles().filter((file) => file.relativePath !== SELF);
  const firebaseStorageUse = sourceFiles.filter((file) => /firebase\/storage|firebaseStorage/i.test(file.text));
  if (firebaseStorageUse.length) {
    add("warning", "Firebase", "وجد استخدامًا محتملًا لـ Firebase Storage رغم قاعدة deny-all", firebaseStorageUse.map((file) => file.relativePath));
  } else {
    add("healthy", "Firebase", "لا يوجد استيراد واضح لـ Firebase Storage في الكود المقروء");
  }

  if (packageJson?.scripts?.["test:rules"] && commandAvailable("firebase")) {
    add("healthy", "Firebase", "Firebase CLI متاح ويمكن تجربة test:rules في بوابة التحقق");
  } else {
    add("warning", "Firebase", "Firebase Emulator/CLI غير متاح؛ test:rules يحتاج بيئة Firebase قبل تشغيله");
  }
}

function checkSyncAndBackup() {
  const required = [
    "src/lib/types.ts",
    "src/lib/store.ts",
    "src/lib/sync.ts",
    "src/lib/merge.ts",
    "src/lib/syncAdopt.ts",
    "src/lib/syncDecision.ts",
    "src/components/sync/SyncProvider.tsx",
    "src/components/settings/BackupCard.tsx",
    "src/lib/backupCrypto.ts",
    "src/lib/backupFile.ts",
  ];
  const missing = required.filter((path) => !pathExists(path));
  if (missing.length) add("warning", "المزامنة والنسخ الاحتياطي", "ملفات المسار الأساسية مفقودة", missing);
  else add("healthy", "المزامنة والنسخ الاحتياطي", "ملفات النموذج والمزامنة والنسخ الاحتياطي موجودة");

  const sync = readText("src/lib/sync.ts") ?? "";
  const merge = readText("src/lib/merge.ts") ?? "";
  const adopt = readText("src/lib/syncAdopt.ts") ?? "";
  const provider = readText("src/components/sync/SyncProvider.tsx") ?? "";
  const store = readText("src/lib/store.ts") ?? "";
  const backup = readText("src/components/settings/BackupCard.tsx") ?? "";
  const types = readText("src/lib/types.ts") ?? "";

  for (const [label, text, pattern] of [
    ["AppData", types, /(?:interface|type)\s+AppData/],
    ["mergeAppData", merge, /mergeAppData/],
    ["hydrateCloudPhotos", sync + provider, /hydrateCloudPhotos/],
    ["applyTombstones", merge + sync, /applyTombstones/],
    ["normalizeBackup", backup, /normalizeBackup/],
    ["snapshot/hydrate", store, /snapshot[\s\S]{0,200}hydrate|hydrate[\s\S]{0,200}snapshot/],
  ]) {
    if (pattern.test(text)) add("healthy", "المزامنة والنسخ الاحتياطي", `${label} حاضر في المسار المتوقع`);
    else add("warning", "المزامنة والنسخ الاحتياطي", `تعذر إثبات ${label} بفحص النص؛ يحتاج مراجعة بشرية`);
  }

  const mergeIndex = adopt.indexOf("const save = mergeAppData(local, cloud)");
  const hydrateIndex = provider.indexOf("hydrateCloudPhotos(space, merged, mediaKey)");
  if (mergeIndex >= 0 && hydrateIndex >= 0) {
    add("healthy", "المزامنة والنسخ الاحتياطي", "مسار التبنّي يدمج المراجع في syncAdopt ثم يمرر الناتج لترطيب الوسائط في SyncProvider");
  } else {
    add("improvement", "المزامنة والنسخ الاحتياطي", "تعذر إثبات ترتيب merge ثم hydrate آليًا؛ راجعه بشريًا قبل تغيير المسار");
  }

  if (/mediaManifest|attachmentRefs|photoRefs/.test(sync + merge + backup)) {
    add("healthy", "المزامنة والنسخ الاحتياطي", "مراجع الوسائط/manifest حاضرة في مسار المزامنة");
  } else {
    add("warning", "المزامنة والنسخ الاحتياطي", "لم يظهر دليل manifest أو مراجع الوسائط في المسار المقروء");
  }
  if (/restore|import|decrypt/i.test(backup) && /export|backup/i.test(backup)) {
    add("healthy", "المزامنة والنسخ الاحتياطي", "مسارا التصدير والاسترجاع/الاستيراد حاضران في BackupCard");
  } else {
    add("warning", "المزامنة والنسخ الاحتياطي", "تعذر إثبات مسار استرجاع كامل من BackupCard");
  }
}

function checkRtlAndExperience(projectFiles) {
  const layout = readText("src/app/layout.tsx") ?? "";
  const globals = readText("src/app/globals.css") ?? "";
  const nav = readText("src/lib/nav.ts") ?? "";
  const indic = readText("src/lib/indicDigits.test.ts") ?? "";
  const utils = readText("src/lib/utils.ts") ?? "";

  if (/lang=["']ar["']/.test(layout) && /dir=["']rtl["']/.test(layout)) add("healthy", "RTL وتجربة مدار", "جذر التطبيق يعلن lang=ar وdir=rtl");
  else add("warning", "RTL وتجربة مدار", "لم يثبت lang=ar وdir=rtl في layout.tsx");
  if (/direction:\s*rtl/.test(globals) && /unicode-bidi:\s*plaintext/.test(globals)) add("healthy", "RTL وتجربة مدار", "قواعد RTL وunicode-bidi موجودة في globals.css");
  else add("warning", "RTL وتجربة مدار", "قواعد RTL أو unicode-bidi ناقصة في globals.css");
  if (pathExists("src/lib/indicDigits.test.ts") && /toIndicDigits|formatAmount|arabicCount/.test(indic + utils)) add("healthy", "RTL وتجربة مدار", "بوابة الأرقام الهندية والمنسقات الأساسية موجودة");
  else add("warning", "RTL وتجربة مدار", "تعذر إثبات بوابة الأرقام الهندية أو منسقات العرض");
  if (pathExists("src/lib/nav.ts") && /MobileNav|Sidebar/.test(nav + (readText("src/components/layout/MobileNav.tsx") ?? "") + (readText("src/components/layout/Sidebar.tsx") ?? ""))) add("healthy", "RTL وتجربة مدار", "مصدر التنقل المشترك موجود ومستخدم في الشريطين");
  else add("warning", "RTL وتجربة مدار", "تعذر إثبات مصدر تنقل مشترك للشريطين");
  if (/\.dark/.test(globals)) add("healthy", "RTL وتجربة مدار", "نظام الوضع الليلي حاضر في globals.css");
  else add("improvement", "RTL وتجربة مدار", "لم يظهر محدد .dark في globals.css؛ راجع الثيم الليلي يدويًا");

  const formatterHits = [];
  const isoHits = [];
  for (const file of projectFiles.filter((item) => isCodeFile(item.relativePath))) {
    const lines = file.text.split("\n");
    lines.forEach((line, index) => {
      if (/Intl\.NumberFormat/.test(line) && !/-u-nu-arab/.test(line)) formatterHits.push(`${file.relativePath}:${index + 1}`);
      if (/toISOString\(\)/.test(line)) isoHits.push(`${file.relativePath}:${index + 1}`);
    });
  }
  if (formatterHits.length) add("improvement", "RTL وتجربة مدار", `وجدت ${formatterHits.length} منسق Intl يحتاج مراجعة تثبيت نظام الأرقام`, formatterHits.slice(0, 10));
  else add("healthy", "RTL وتجربة مدار", "لم يظهر منسق Intl غير مثبت على arab في السطر نفسه");
  if (isoHits.length) add("improvement", "التواريخ", `وجدت ${isoHits.length} استخدامًا لـ toISOString؛ راجع ألا يكون مفتاح تاريخ محلي`, isoHits.slice(0, 10));
  else add("healthy", "التواريخ", "لا يوجد استخدام مباشر لـ toISOString في الكود المقروء");
}

function extractDocumentPaths(text) {
  const paths = new Set();
  const expression = /(?:^|[\s(`])((?:\.github|cloudflare-worker|docs|scripts|src|firebase-tests)\/[A-Za-z0-9_./*-]+)/g;
  for (const match of text.matchAll(expression)) {
    const candidate = match[1].replace(/[),.;:'"`]+$/g, "");
    if (!candidate.includes("*")) paths.add(candidate);
  }
  return [...paths];
}

function checkDocuments(packageJson) {
  const roadmap = readText("ROADMAP.md");
  if (roadmap === null) {
    add("warning", "الوثائق وROADMAP", "ROADMAP.md غير موجود");
    return;
  }
  const arabicDigits = (value) => value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const roadmapHeader = arabicDigits(roadmap.slice(0, 2500)).replaceAll("٫", ".");
  const versions = [...roadmapHeader.matchAll(/0\.1\.(\d+)/g)].map((match) => Number(match[1]));
  const packageVersion = Number(String(packageJson?.version ?? "").split(".").at(-1));
  const roadmapVersion = versions.length ? Math.max(...versions) : null;
  if (roadmapVersion !== null && roadmapVersion === packageVersion) add("healthy", "الوثائق وROADMAP", `نسخة ROADMAP الحالية توافق package.json: 0.1.${packageVersion}`);
  else add("warning", "الوثائق وROADMAP", "نسخة ROADMAP لا تطابق نسخة package.json", `ROADMAP=${roadmapVersion ?? "غير موجودة"}, package=${packageJson?.version ?? "غير موجود"}`);

  const missing = extractDocumentPaths(roadmap).filter((path) => !pathExists(path));
  if (missing.length) add("warning", "الوثائق وROADMAP", "مسارات مذكورة في ROADMAP لا توجد حاليًا", missing.slice(0, 15));
  else add("healthy", "الوثائق وROADMAP", "المسارات المرمّزة في ROADMAP موجودة في بنية المشروع");
  if (/⏳|مؤجل|مؤجلة/.test(roadmap)) add("improvement", "الوثائق وROADMAP", "ROADMAP يحتوي بنودًا مؤجلة؛ أُدرجت للمراجعة البشرية ولم تُنفّذ تلقائيًا");
  if (pathExists("docs/APP-STORE-PLAN.md") && pathExists("docs/FIREBASE-RULES-CANDIDATE.md")) add("healthy", "الوثائق وROADMAP", "وثيقتا خطة App Store وقواعد Firebase موجودتان");
  else add("warning", "الوثائق وROADMAP", "وثيقة App Store أو قواعد Firebase المرجعية مفقودة");
}

function checkHumanReview(projectFiles) {
  const status = (git(["-c", "core.quotePath=false", "status", "--short", "--untracked-files=all"]).stdout ?? "").split("\n").filter(Boolean);
  const taskPaths = new Set([
    "AGENTS.md",
    "package.json",
    SELF,
    ".agents/skills/project-doctor/SKILL.md",
    ".claude/skills/project-doctor/SKILL.md",
  ]);
  const unrelated = status
    .map((line) => line.slice(3).trim())
    .filter((path) => path && !taskPaths.has(path));
  if (unrelated.length) {
    add("warning", "مراجعة بشرية", "working tree يحتوي تغييرات خارج نطاق Project Doctor؛ لم تُعدّل أو تُحذف", unrelated.slice(0, 20));
  } else {
    add("healthy", "مراجعة بشرية", "لا توجد تغييرات خارج ملفات Project Doctor");
  }

  const reviewMarkers = [];
  const largeFiles = [];
  for (const file of projectFiles.filter((item) => isCodeFile(item.relativePath))) {
    if (file.relativePath === SELF) continue;
    const lines = file.text.split("\n");
    if (lines.length > 900) largeFiles.push(`${file.relativePath} (${lines.length} سطر)`);
    lines.forEach((line, index) => {
      if (/\b(?:TODO|FIXME|HACK|XXX)\b|تحتاج مراجعة/i.test(line)) reviewMarkers.push(`${file.relativePath}:${index + 1}`);
    });
  }
  if (reviewMarkers.length) add("improvement", "مراجعة بشرية", `وجدت ${reviewMarkers.length} علامة TODO/FIXME أو مراجعة`, reviewMarkers.slice(0, 12));
  if (largeFiles.length) add("improvement", "مراجعة بشرية", "ملفات كبيرة تستحق مراجعة بشرية عند أي تغيير واسع", largeFiles.slice(0, 12));
  if (!reviewMarkers.length && !largeFiles.length) add("healthy", "مراجعة بشرية", "لم تظهر علامات TODO أو ملفات كبيرة فوق العتبة المحددة");
}

function calculateScore() {
  const critical = findings.critical.length;
  const warning = findings.warning.length;
  const improvement = findings.improvement.length;
  return Math.max(0, 100 - critical * 30 - warning * 8 - improvement * 2);
}

function overallLabel(score) {
  if (findings.critical.length) return "حرج";
  if (score < 75) return "تحذير";
  if (findings.warning.length || findings.improvement.length) return "سليم مع ملاحظات";
  return "سليم";
}

function printReport(packageJson) {
  const score = calculateScore();
  const result = {
    project: packageJson?.name ?? "مدار",
    readOnly: true,
    score,
    status: overallLabel(score),
    counts: Object.fromEntries(Object.entries(findings).map(([key, value]) => [key, value.length])),
    findings,
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Project Doctor — مدار");
  console.log("فحص قراءة وتشخيص فقط؛ لا يكتب أو يحذف أو يصلح أي ملف، ولا يحفظ تقريرًا داخل Git.");
  console.log(`المجلد: ${ROOT}`);
  console.log("");

  const sections = [
    ["critical", "حرج"],
    ["warning", "تحذير"],
    ["improvement", "تحسين"],
    ["healthy", "سليم"],
  ];
  for (const [key, label] of sections) {
    const list = findings[key];
    console.log(`${label} (${list.length})`);
    if (!list.length) {
      console.log("  لا توجد نتائج.");
      continue;
    }
    for (const item of list) {
      console.log(`  • [${item.area}] ${item.message}`);
      if (item.detail) {
        const details = String(item.detail).split("، ");
        for (const detail of details) console.log(`    - ${detail}`);
      }
    }
  }

  console.log("");
  console.log(`النتيجة النهائية: ${score}/100 — ${overallLabel(score)}`);
  console.log(`التقسيم: حرج ${findings.critical.length} | تحذير ${findings.warning.length} | تحسين ${findings.improvement.length} | سليم ${findings.healthy.length}`);
}

function main() {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run doctor:ai [-- --json]");
    console.log("Project Doctor reads project files and prints diagnostics; it has no fix or write mode.");
    return;
  }

  const packageJson = readJson("package.json");
  const lockJson = readJson("package-lock.json");
  const projectFiles = allTextFiles();

  if (packageJson === undefined) add("critical", "المشروع", "package.json موجود لكنه غير صالح JSON");
  else if (!packageJson) add("critical", "المشروع", "package.json غير موجود");
  else add("healthy", "المشروع", `package.json صالح: ${packageJson.name ?? "بدون اسم"} ${packageJson.version ?? "بدون نسخة"}`);

  checkInstructions();
  checkScripts(packageJson ?? {});
  checkDependencies(packageJson ?? {}, lockJson, projectFiles);
  checkSecrets(projectFiles);
  checkFirebase(packageJson ?? {});
  checkSyncAndBackup();
  checkRtlAndExperience(projectFiles);
  checkDocuments(packageJson ?? {});
  checkHumanReview(projectFiles);
  printReport(packageJson ?? {});

  if (findings.critical.length) process.exitCode = 2;
}

main();
