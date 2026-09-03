import type { Metadata } from "next";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { ArrowLeft, CheckCircle2, MapPin, Maximize2, PlugZap, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { uiEquipmentAlt, uiEquipmentModel, uiEquipmentName } from "@/lib/ui-equipment";

type Props = { params: Promise<{ slug: string }> };

function findEquipment(slug: string) {
  return equipmentCatalog.find((item) => item.slug === slug);
}

export function generateStaticParams() {
  return equipmentCatalog.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = findEquipment(slug);
  return item
    ? { title: uiEquipmentName(item), description: item.summary }
    : { title: "Equipment not found" };
}

export default async function EquipmentDetailPage({ params }: Props) {
  const { slug } = await params;
  const item = findEquipment(slug);
  if (!item) notFound();

  return (
    <div className="page-wrap detail-page">
      <Link href="/equipment" className="back-link">
        <ArrowLeft size={16} /> Back to catalog
      </Link>
      <div className="detail-hero">
        <div className="detail-visual">
          <Image
            src={item.imageUrl}
            alt={uiEquipmentAlt(item)}
            fill
            preload
            sizes="(max-width: 640px) calc(100vw - 24px), (max-width: 900px) calc(100vw - 40px), min(calc(45vw - 36px), 527px)"
          />
          <span className="tag tag--green">{item.category.replaceAll("-", " ")}</span>
          <div className="detail-visual__caption">
            <span>AI-generated product visualization</span>
            <strong>{uiEquipmentModel(item)} · catalog record</strong>
          </div>
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{item.locationZone}</p>
          <h1 className="page-title">{uiEquipmentName(item)}</h1>
          <p className="page-intro">{item.summary}</p>
          <div className="detail-stats">
            <div>
              <Maximize2 size={18} />
              <span>Footprint</span>
              <strong>
                {item.dimensionsCm.length} × {item.dimensionsCm.width} cm
              </strong>
            </div>
            <div>
              <MapPin size={18} />
              <span>{item.operatingDimensionsCm ? "Operating area" : "Clearance per side"}</span>
              <strong>
                {item.operatingDimensionsCm
                  ? `${item.operatingDimensionsCm.length} × ${item.operatingDimensionsCm.width} cm`
                  : `${item.requiredClearanceCm} cm`}
              </strong>
            </div>
            <div>
              <PlugZap size={18} />
              <span>Power</span>
              <strong>{item.power === "ac-adapter" ? "AC adapter" : item.power}</strong>
            </div>
          </div>
          <div className="detail-actions">
            <Link className="button button--dark" href="/session">
              View staff walkthroughs
            </Link>
            <a
              className="button button--light"
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Technical reference
            </a>
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <section className="card detail-panel">
          <h2>What it supports</h2>
          <ul className="check-list">
            {item.capabilities.map((entry) => (
              <li key={entry}>
                <CheckCircle2 size={17} />
                {entry}
              </li>
            ))}
          </ul>
        </section>
        <section className="card detail-panel">
          <h2>Access notes</h2>
          {item.accessibility.length ? (
            <ul className="check-list">
              {item.accessibility.map((entry) => (
                <li key={entry}>
                  <ShieldCheck size={17} />
                  {entry}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No dedicated accessibility features are listed. Ask staff for setup support.
            </p>
          )}
        </section>
        <section className="card detail-panel">
          <h2>Good fit for</h2>
          <div className="tag-cloud">
            {item.suitabilityTags.map((entry) => (
              <span className="tag" key={entry}>
                {entry}
              </span>
            ))}
          </div>
        </section>
        <section className="card detail-panel">
          <h2>Catalog integrity</h2>
          <p className="muted">
            This catalog record was checked against technical references on {item.sourceCheckedAt}.
            The visualization, planning clearance, zone, and availability are synthetic for the
            demo.
          </p>
          <a className="manufacturer-link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Technical reference
          </a>
          <span className={item.available ? "tag tag--green" : "tag tag--orange"}>
            {item.available ? "Available now" : "Temporarily unavailable"}
          </span>
        </section>
      </div>
    </div>
  );
}
