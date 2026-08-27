"use client";

import type { Equipment } from "@adaptive-world/contracts";
import { ArrowRight, Check, Grid2X2, List, Search, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Equipment["category"] | "all">("all");
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const results = useMemo(
    () =>
      equipment.filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (accessibleOnly && item.accessibility.length === 0) return false;
        if (availableOnly && !item.available) return false;
        if (!deferredQuery) return true;
        const haystack = [
          item.name,
          item.manufacturer,
          item.model,
          item.summary,
          ...item.capabilities,
          ...item.suitabilityTags,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(deferredQuery);
      }),
    [accessibleOnly, availableOnly, category, deferredQuery, equipment],
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
          Product models, specifications, images, and source links are manufacturer-backed. Only
          this demo club&apos;s ownership and live availability are synthetic.
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
              <EquipmentCard item={item} key={item.id} featured={index === 0 && view === "grid"} />
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

function EquipmentCard({ item, featured }: { item: Equipment; featured: boolean }) {
  return (
    <article
      className={featured ? "equipment-card equipment-card--featured card" : "equipment-card card"}
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
