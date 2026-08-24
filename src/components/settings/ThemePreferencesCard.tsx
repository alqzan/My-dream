"use client";
import { Paintbrush, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useAppStore } from "@/lib/store";
import {
  MADAR_SECTION_KEYS,
  THEME_PALETTES,
  type AccentPalette,
  type MadarSectionKey,
} from "@/lib/theme";

const SECTION_LABELS: Record<MadarSectionKey, string> = {
  home: "البهو",
  quran: "القرآن",
  reading: "المحبرة",
  journal: "المذكرات",
  finance: "المال",
  prayers: "الصلاة",
  stats: "الإحصائيات",
};

export function ThemePreferencesCard() {
  const themePalette = useAppStore((s) => s.themePalette);
  const sectionPalettes = useAppStore((s) => s.sectionPalettes);
  const setThemePalette = useAppStore((s) => s.setThemePalette);
  const setSectionPalette = useAppStore((s) => s.setSectionPalette);

  function selectPalette(value: string): AccentPalette {
    return THEME_PALETTES.some((palette) => palette.id === value)
      ? (value as AccentPalette)
      : "madar";
  }

  return (
    <Card className="mdr-theme-card">
      <div className="mdr-theme-card-head">
        <Paintbrush size={17} />
        <div>
          <div className="mdr-theme-card-title">ألوان مدار</div>
          <p className="mdr-theme-card-copy">
            اختر لونًا واحدًا للتطبيق كاملًا، أو اجعل قسمًا معيّنًا بلون مستقل. هذا تفضيل جهازي ولا يغيّر بياناتك أو مزامنتك.
          </p>
        </div>
      </div>

      <div className="mdr-theme-group">
        <div className="mdr-theme-group-label">
          <span>اللون العام</span>
          <span>{THEME_PALETTES.find((palette) => palette.id === themePalette)?.label ?? "مدار"}</span>
        </div>
        <div className="mdr-theme-grid" role="radiogroup" aria-label="اللون العام للتطبيق">
          {THEME_PALETTES.map((palette) => (
            <button
              key={palette.id}
              type="button"
              className={`mdr-theme-choice ${themePalette === palette.id ? "is-active" : ""}`}
              aria-pressed={themePalette === palette.id}
              onClick={() => setThemePalette(palette.id)}
              title={palette.description}
            >
              <span className="mdr-theme-swatch" style={{ background: palette.swatch }} aria-hidden="true" />
              <strong>{palette.label}</strong>
              <small>{palette.description}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="mdr-theme-group">
        <div className="mdr-theme-group-label">
          <span>لون كل قسم</span>
          <span>اختياري</span>
        </div>
        <div className="space-y-2">
          {MADAR_SECTION_KEYS.map((section) => (
            <label key={section} className="flex items-center gap-3">
              <span className="min-w-20 text-xs font-semibold text-gray-700 dark:text-gray-300">{SECTION_LABELS[section]}</span>
              <select
                className="mdr-theme-select"
                value={sectionPalettes?.[section] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSectionPalette(section, value ? selectPalette(value) : null);
                }}
                aria-label={`لون قسم ${SECTION_LABELS[section]}`}
              >
                <option value="">يتبع اللون العام</option>
                {THEME_PALETTES.map((palette) => (
                  <option key={palette.id} value={palette.id}>{palette.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {Object.keys(sectionPalettes ?? {}).length > 0 && (
          <button
            type="button"
            className="mdr-theme-reset inline-flex items-center gap-1.5"
            onClick={() => MADAR_SECTION_KEYS.forEach((section) => setSectionPalette(section, null))}
          >
            <RotateCcw size={12} /> توحيد كل الأقسام على اللون العام
          </button>
        )}
      </div>

      <p className="mdr-theme-note">الوضع الليلي/النهاري وتلقائي مع المغرب يبقى من زر الشمس أعلى التطبيق، وهذا الخيار يغيّر اللون فقط.</p>
    </Card>
  );
}
