"use client";

import type { Equipment } from "@adaptive-world/contracts";
import { ArrowRight, Check, Grid2X2, List, Search, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useGymExperience } from "@/components/gym-experience-context";
import { matchesEquipmentSearch } from "@/lib/equipment-search";

const categoryLabels: Record<Equipment["category"], string> = {
  cardio: "Cardio",
  "selectorized-strength": "Selectorized",
  "plate-loaded-strength": "Plate loaded",
  "free-weights": "Free weights",
  "functional-training": "Functional",
  "pilates-mobility": "Pilates & mobility",
  rehabilitation: "Rehabilitation",
};

type Props = { equipment: Equipment[] };

export function CatalogExplorer({ equipment }: Props) {
  const { searchIntent, searchRevision } = useGymExperience();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Equipment["category"] | "all">("all");
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [webMcpConstraints, setWebMcpConstraints] = useState<{
    categories?: readonly string[];
    maxWidthCm?: number;
    maxDepthCm?: number;
  }>({});
  const [highlightMatches, setHighlightMatches] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (!searchIntent || searchRevision === 0) return;
    setQuery(searchIntent.query ?? "");
    const firstCategory = searchIntent.categories?.find((value) => value in categoryLabels);
    setCategory((firstCategory as Equipment["category"] | undefined) ?? "all");
    setAccessibleOnly(searchIntent.accessible === true);
    setAvailableOnly(true);
    setWebMcpConstraints({
      categories: searchIntent.categories,
      maxWidthCm: searchIntent.maxWidthCm,
      maxDepthCm: searchIntent.maxDepthCm,
    });
    setHighlightMatches(true);
    const scrollTimer = window.setTimeout(
      () => document.querySelector(".catalog-results")?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
    const highlightTimer = window.setTimeout(() => setHighlightMatches(false), 2_500);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [searchIntent, searchRevision]);

  const results = useMemo(
    () =>
      equipment.filter((item) =>
        matchesEquipmentSearch(item, {
          query: deferredQuery,
          ...(category !== "all" ? { category } : {}),
          categories: webMcpConstraints.categories,
          maxWidthCm: webMcpConstraints.maxWidthCm,
          maxDepthCm: webMcpConstraints.maxDepthCm,
          accessibleOnly,
          availableOnly,
        }),
      ),
    [accessibleOnly, availableOnly, category, deferredQuery, equipment, webMcpConstraints],
  );

  const categories = Object.keys(categoryLabels) as Equipment["category"][];

  return (
    <div className="catalog-layout">
      <aside className="filter-panel card" aria-label="Catalog filters">
        <div className="filter-panel__heading">
          <SlidersHorizontal size={18} />
          <strong>Refine catalog</strong>
        </div>
        <fieldset>
          <legend>Category</legend>
          <button
            className={category === "all" ? "filter-option is-active" : "filter-option"}
            onClick={() => setCategory("all")}
            type="button"
          >
            <span>All equipment</span>
            <small>{equipment.length}</small>
          </button>
          {categories.map((value) => {
            const count = equipment.filter((item) => item.category === value).length;
            return (
              <button
                className={category === value ? "filter-option is-active" : "filter-option"}
                key={value}
                onClick={() => setCategory(value)}
                type="button"
              >
                <span>{categoryLabels[value]}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </fieldset>
        <fieldset>
          <legend>Availability & access</legend>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
            />
            <span className="switch" />
            <span>Available now</span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={accessibleOnly}
              onChange={(event) => setAccessibleOnly(event.target.checked)}
            />
            <span className="switch" />
            <span>Access features listed</span>
          </label>
        </fieldset>
        <p className="fine-print">
          AI-generated product visualizations support orientation only. Each cited manufacturer
          source is authoritative for product identity and specifications; this demo club&apos;s
          ownership and live availability are synthetic.
        </p>
      </aside>

      <section className="catalog-results" aria-live="polite">
        <div className="catalog-toolbar">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search equipment</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by machine, goal or movement…"
            />
            {query && (
              <button onClick={() => setQuery("")} type="button" aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </label>
          <div className="view-toggle" aria-label="Catalog view">
            <button
              type="button"
              className={view === "grid" ? "is-active" : ""}
              onClick={() => setView("grid")}
              aria-label="Grid view"
            >
              <Grid2X2 size={17} />
            </button>
            <button
              type="button"
              className={view === "list" ? "is-active" : ""}
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
        <div className="results-summary">
          <strong>{results.length}</strong> pieces of equipment <span>·</span> Grounded in this
          facility
        </div>
        {results.length > 0 ? (
          <div
            className={view === "grid" ? "equipment-grid" : "equipment-grid equipment-grid--list"}
          >
            {results.map((item, index) => (
              <EquipmentCard
                item={item}
                key={item.id}
                featured={index === 0 && view === "grid"}
                highlighted={highlightMatches}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state card">
            <Search size={30} />
            <h2>No exact matches</h2>
            <p>Try a broader movement, remove a filter or explore all equipment.</p>
            <button
              className="button button--dark"
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setAccessibleOnly(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function EquipmentCard({
  item,
  featured,
  highlighted,
}: {
  item: Equipment;
  featured: boolean;
  highlighted: boolean;
}) {
  return (
    <article
      data-equipment-id={item.id}
      className={`${
        featured ? "equipment-card equipment-card--featured card" : "equipment-card card"
      }${highlighted ? " is-webmcp-match" : ""}`}
    >
      <div className="equipment-card__visual equipment-card__visual--product">
        <Image
          src={item.imageUrl}
          alt={item.imageAlt}
          fill
          sizes={featured ? "(max-width: 900px) 100vw, 48vw" : "(max-width: 900px) 100vw, 28vw"}
        />
        <span className="tag">{categoryLabels[item.category]}</span>
        <span className="availability">
          <Check size={12} /> Available
        </span>
      </div>
      <div className="equipment-card__body">
        <p className="equipment-card__brand">
          {item.manufacturer} · {item.model}
        </p>
        <h2>{item.name}</h2>
        <p>{item.summary}</p>
        <a className="manufacturer-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
          Verified from {item.sourceLabel} <ArrowRight size={12} />
        </a>
        <div className="equipment-card__meta">
          <span>
            {item.dimensionsCm.length} × {item.dimensionsCm.width} cm
          </span>
          <span>{item.locationZone}</span>
        </div>
        <Link href={`/equipment/${item.slug}`} className="equipment-card__link">
          View specifications <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
