"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Currency {
  code: string;
  label: string;
}

interface Props {
  initialCurrencies: Currency[];
}

// ─── Known currencies ─────────────────────────────────────────────────────────

const KNOWN_CURRENCIES: Currency[] = [
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "RUB", label: "Russian Ruble" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NOK", label: "Norwegian Krone" },
  { code: "DKK", label: "Danish Krone" },
  { code: "INR", label: "Indian Rupee" },
  { code: "KRW", label: "South Korean Won" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "ZAR", label: "South African Rand" },
  { code: "AED", label: "UAE Dirham" },
  { code: "THB", label: "Thai Baht" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "PLN", label: "Polish Zloty" },
  { code: "CZK", label: "Czech Koruna" },
  { code: "HUF", label: "Hungarian Forint" },
  { code: "TRY", label: "Turkish Lira" },
  { code: "UAH", label: "Ukrainian Hryvnia" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidCode(code: string): boolean {
  return /^[A-Za-z]{3}$/.test(code);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CurrencySettings({ initialCurrencies }: Props) {
  const searchId = useId();

  const [currencies, setCurrencies] = useState<Currency[]>(initialCurrencies);
  const [search, setSearch] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Per-currency loading / error state for remove actions
  const [removingCodes, setRemovingCodes] = useState<Set<string>>(new Set());
  const [removeErrors, setRemoveErrors] = useState<Map<string, string>>(new Map());

  // Add action state
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Derived values ────────────────────────────────────────────────────────

  const enabledCodes = new Set(currencies.map((c) => c.code.toUpperCase()));

  const trimmedSearch = search.trim();
  const upperSearch = trimmedSearch.toUpperCase();

  /** Currencies in KNOWN_CURRENCIES not yet enabled, matching the search query */
  const filteredKnown = KNOWN_CURRENCIES.filter(
    (c) =>
      !enabledCodes.has(c.code) &&
      (c.code.toUpperCase().includes(upperSearch) ||
        c.label.toLowerCase().includes(trimmedSearch.toLowerCase())),
  );

  /**
   * Show the "add custom" row when:
   * – The search text looks like a 3-letter code that isn't already enabled
   * – AND it's not already in KNOWN_CURRENCIES (those are handled by filteredKnown)
   */
  const isCustomCodeCandidate =
    isValidCode(trimmedSearch) &&
    !enabledCodes.has(upperSearch) &&
    !KNOWN_CURRENCIES.some((c) => c.code === upperSearch);

  // ── Close dropdown on outside click ──────────────────────────────────────

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(e.target as Node)
    ) {
      setDropdownOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [handleOutsideClick]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleRemove(code: string) {
    setRemovingCodes((prev) => new Set(prev).add(code));
    setRemoveErrors((prev) => {
      const next = new Map(prev);
      next.delete(code);
      return next;
    });

    try {
      const res = await fetch(`/api/settings/currencies/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to remove ${code}`);
      }

      setCurrencies((prev) => prev.filter((c) => c.code !== code));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setRemoveErrors((prev) => new Map(prev).set(code, message));
    } finally {
      setRemovingCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  }

  async function handleAdd(code: string, label: string) {
    const normalizedCode = code.toUpperCase();

    if (enabledCodes.has(normalizedCode)) return;

    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/settings/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode, label }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg =
          typeof data.error === "string"
            ? data.error
            : `Failed to add ${normalizedCode}`;
        throw new Error(msg);
      }

      setCurrencies((prev) => [...prev, { code: normalizedCode, label }]);
      setSearch("");
      setCustomLabel("");
      setDropdownOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setAdding(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section
      aria-labelledby="currency-settings-heading"
      className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/40"
    >
      {/* Section heading */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-emerald-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.798 7.45c.512-.67 1.135-1.2 2.202-1.2 1.63 0 2.75 1.226 2.75 2.75 0 1.524-1.12 2.75-2.75 2.75-.823 0-1.445-.333-1.944-.8l-.504.8H7.5l.654-1.04A3.51 3.51 0 0 1 8 9.748v-.5c0-.31.025-.61.073-.9L7.5 7.45h1.298Zm1.202.3c-.717 0-1.25.438-1.53 1.05l1.064 1.69c.217.19.479.26.716.26.876 0 1.5-.637 1.5-1.5s-.624-1.5-1.5-1.5h-.25Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h2
            id="currency-settings-heading"
            className="text-base font-semibold text-white"
          >
            Active Currencies
          </h2>
          <p className="text-xs text-slate-500">
            These currencies appear in account and transaction forms.
          </p>
        </div>
      </div>

      {/* ── Active currency list ── */}
      <ul
        aria-label="Active currencies"
        className="mb-6 divide-y divide-slate-800/60"
      >
        {currencies.length === 0 && (
          <li className="py-4 text-center text-sm text-slate-500">
            No currencies enabled. Add one below.
          </li>
        )}

        {currencies.map((currency) => {
          const isRemoving = removingCodes.has(currency.code);
          const removeError = removeErrors.get(currency.code);
          const isOnlyOne = currencies.length === 1;

          return (
            <li key={currency.code}>
              <div className="flex items-center gap-3 py-3">
                {/* Code badge */}
                <span className="min-w-[3.25rem] rounded bg-slate-800 px-2 py-0.5 text-center font-mono text-sm font-medium text-emerald-300 ring-1 ring-slate-700/60">
                  {currency.code}
                </span>

                {/* Label */}
                <span className="flex-1 text-sm text-slate-300">
                  {currency.label}
                </span>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(currency.code)}
                  disabled={isRemoving || isOnlyOne}
                  aria-label={
                    isOnlyOne
                      ? `Cannot remove ${currency.code} — at least one currency is required`
                      : `Remove ${currency.code}`
                  }
                  title={
                    isOnlyOne
                      ? "At least one currency must remain active"
                      : `Remove ${currency.label}`
                  }
                  className={[
                    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition",
                    isRemoving || isOnlyOne
                      ? "cursor-not-allowed text-slate-600"
                      : "text-slate-500 hover:bg-red-500/15 hover:text-red-400",
                  ].join(" ")}
                >
                  {isRemoving ? (
                    // Spinner
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                  ) : (
                    // Trash icon
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* Inline remove error */}
              {removeError && (
                <p
                  role="alert"
                  className="mb-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 ring-1 ring-red-500/20"
                >
                  {removeError}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Add currency ── */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-500">
          Add Currency
        </p>

        {/* Search / input row */}
        <div ref={dropdownRef} className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search currencies
          </label>
          <div className="flex items-center rounded-lg border border-slate-700/70 bg-slate-800/60 px-3 focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/30 transition">
            {/* Search icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 flex-shrink-0 text-slate-500"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>

            <input
              id={searchId}
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDropdownOpen(true);
                setAddError(null);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Search currencies…"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              className="flex-1 bg-transparent px-2 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />

            {/* Clear button */}
            {search.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch("");
                  setCustomLabel("");
                  setDropdownOpen(false);
                  searchRef.current?.focus();
                }}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Dropdown ── */}
          {dropdownOpen && (filteredKnown.length > 0 || isCustomCodeCandidate) && (
            <div
              role="listbox"
              aria-label="Currency suggestions"
              className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-900 py-1 shadow-2xl shadow-slate-950/60 ring-1 ring-slate-800/80"
            >
              {/* Known matches */}
              {filteredKnown.map((c) => (
                <button
                  key={c.code}
                  role="option"
                  aria-selected={false}
                  type="button"
                  disabled={adding}
                  onClick={() => handleAdd(c.code, c.label)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-800/80 disabled:opacity-50"
                >
                  <span className="min-w-[3rem] rounded bg-slate-800 px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-cyan-300 ring-1 ring-slate-700/60">
                    {c.code}
                  </span>
                  <span className="text-sm text-slate-300">{c.label}</span>

                  {/* Plus icon */}
                  <span className="ml-auto flex-shrink-0 text-slate-600 group-hover:text-emerald-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4 text-slate-600"
                      aria-hidden="true"
                    >
                      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                    </svg>
                  </span>
                </button>
              ))}

              {/* Custom code entry */}
              {isCustomCodeCandidate && (
                <div className="border-t border-slate-800/60 px-3 pb-2 pt-2.5">
                  <p className="mb-1.5 text-xs text-slate-500">
                    Custom currency —{" "}
                    <span className="font-mono font-semibold text-cyan-300">
                      {upperSearch}
                    </span>{" "}
                    not in list
                  </p>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder={`Label for ${upperSearch} (e.g. "My Currency")`}
                    maxLength={80}
                    className="mb-2 w-full rounded-lg border border-slate-700/70 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition"
                  />
                  <button
                    type="button"
                    disabled={adding || customLabel.trim().length === 0}
                    onClick={() =>
                      handleAdd(upperSearch, customLabel.trim())
                    }
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-600/30 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {adding ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                        Adding…
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                        </svg>
                        Add {upperSearch}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add error */}
        {addError && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 ring-1 ring-red-500/20"
          >
            {addError}
          </p>
        )}

        {/* Loading state for known-currency adds */}
        {adding && (
          <p
            aria-live="polite"
            className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"
          >
            <svg
              className="h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Saving currency…
          </p>
        )}
      </div>
    </section>
  );
}
