import { ArrowUpRight, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_FILTERS,
  sameFilters,
  type SearchFilters,
} from "./searchFilters";

const languages = [
  "Python",
  "TypeScript",
  "JavaScript",
  "Rust",
  "Go",
  "Java",
  "C",
  "C++",
  "C#",
  "Swift",
  "Kotlin",
  "Ruby",
  "PHP",
  "Dart",
  "Shell",
  "Jupyter Notebook",
];
const starPresets = [0, 100, 500, 1000, 5000, 10000, 50000];

export default function SearchFilterBar({
  value,
  onChange,
  busy,
  disabled = false,
}: {
  value: SearchFilters;
  onChange: (value: SearchFilters) => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [customStars, setCustomStars] = useState(false);
  const starChoice =
    customStars ||
    (value.min_stars !== null && !starPresets.includes(value.min_stars))
      ? "custom"
      : String(value.min_stars ?? "");
  return (
    <details
      className="search-filters"
      onInvalid={(event) => {
        event.currentTarget.open = true;
      }}
    >
      <summary>
        <SlidersHorizontal size={16} />
        <span>筛选</span>
      </summary>
      <div className="filter-fields">
        <label>
          最低 Star
          <select
            disabled={disabled}
            aria-label="最低 Star"
            form="explorer-search"
            value={starChoice}
            onChange={(event) => {
              const choice = event.target.value;
              setCustomStars(choice === "custom");
              if (choice !== "custom")
                onChange({
                  ...value,
                  min_stars: choice === "" ? null : Number(choice),
                });
            }}
          >
            <option value="">默认</option>
            {starPresets.map((stars) => (
              <option key={stars} value={stars}>
                {stars === 0 ? "不限" : `≥ ${stars.toLocaleString()}`}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
        </label>
        {starChoice === "custom" && (
          <label>
            自定义最低 Star
            <input
              disabled={disabled}
              form="explorer-search"
              type="number"
              min={0}
              max={1000000000}
              step={1}
              placeholder="默认"
              value={value.min_stars ?? ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  min_stars:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </label>
        )}
        <label>
          主要语言
          <select
            disabled={disabled}
            aria-label="主要语言"
            form="explorer-search"
            value={value.language || ""}
            onChange={(event) =>
              onChange({ ...value, language: event.target.value || null })
            }
          >
            <option value="">不限</option>
            {languages.map((language) => (
              <option key={language}>{language}</option>
            ))}
          </select>
        </label>
        <label>
          最近提交
          <select
            disabled={disabled}
            aria-label="最近提交"
            form="explorer-search"
            value={value.pushed_days ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                pushed_days: event.target.value
                  ? (Number(event.target.value) as SearchFilters["pushed_days"])
                  : null,
              })
            }
          >
            <option value="">不限</option>
            {[30, 90, 180, 365].map((days) => (
              <option key={days} value={days}>
                近 {days} 天
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button form="explorer-search" type="submit" disabled={disabled || busy}>
            搜索 <ArrowUpRight size={16} />
          </button>
          <button
            type="button"
            title="重置筛选"
            aria-label="重置筛选"
            onClick={() => {
              setCustomStars(false);
              onChange({ ...DEFAULT_FILTERS });
            }}
            disabled={disabled || (!customStars && sameFilters(value, DEFAULT_FILTERS))}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
    </details>
  );
}
