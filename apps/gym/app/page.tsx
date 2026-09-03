import { equipmentCatalog } from "@adaptive-world/demo-data";
import Image from "next/image";
import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { gymProfile } from "@/lib/gym-profile";
import { facilityTemplates } from "@/lib/session-planner";
import { ROUTINE_PRO } from "@/lib/commerce/constants";
import { uiEquipmentAlt, uiEquipmentManufacturer, uiEquipmentName } from "@/lib/ui-equipment";

const routineProPrice = `$${(ROUTINE_PRO.amountMinor / 100).toFixed(2)} test ${ROUTINE_PRO.currency.toUpperCase()}`;

export default function HomePage() {
  const sample = facilityTemplates[0]!;
  const equipmentById = new Map(equipmentCatalog.map((item) => [item.id, item]));

  return (
    <div className="page-wrap home-page">
      <section className="club-hero" aria-labelledby="hero-title">
        <div className="club-hero__media">
          <Image
            src="/images/adaptive-gym-interior.webp"
            alt="Sunlit gym interior with members using a cable row, treadmill, kettlebell, and squat rack"
            fill
            preload
            sizes="(max-width: 640px) calc(100vw - 24px), (max-width: 980px) calc(100vw - 40px), min(calc(54vw - 22px), 670px)"
          />
          <div className="club-hero__overlay" />
          <div className="club-status">
            <span className="status-dot is-active" />
            Demo club open · {gymProfile.hours}
          </div>
          <div className="club-hero__caption">
            <span>
              <MapPin size={14} /> Adaptive Gym Lab
            </span>
            <strong>AI-generated scene. Fictional catalog labels; synthetic inventory.</strong>
          </div>
        </div>
        <div className="club-hero__copy">
          <p className="eyebrow">A consent-first member experience</p>
          <h1 className="display-title" id="hero-title">
            Your first visit, already <em>better prepared.</em>
          </h1>
          <p className="page-intro">
            Browse the club normally, or bring a minimum projection from your Digital Passport. Your
            chosen agent can generate a routine from that projection and our reference-grounded
            equipment, or you can save a published staff walkthrough. The Gym itself never invents
            an AI routine.
          </p>
          <div className="hero__actions">
            <Link href="/passport" className="button button--lime">
              Connect my Passport <Fingerprint size={18} />
            </Link>
            <Link href="/equipment" className="button button--light">
              Tour the equipment <ArrowRight size={18} />
            </Link>
          </div>
          <div className="club-facts">
            <div>
              <strong>22</strong>
              <span>verified commercial models</span>
            </div>
            <div>
              <strong>3</strong>
              <span>staff-authored walkthroughs</span>
            </div>
            <div>
              <strong>0</strong>
              <span>clinical records sent to Gym</span>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Adaptive Gym product principles">
        <div className="proof-item">
          <span className="proof-item__icon">
            <Fingerprint size={19} />
          </span>
          <div>
            <strong>Private member handoff</strong>
            <p>One-use code, anonymous Gym session, no profile picker.</p>
          </div>
        </div>
        <div className="proof-item">
          <span className="proof-item__icon">
            <Boxes size={19} />
          </span>
          <div>
            <strong>Products you can verify</strong>
            <p>Every model is grounded in a technical reference.</p>
          </div>
        </div>
        <div className="proof-item">
          <span className="proof-item__icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>Human-approved action</strong>
            <p>WebMCP uses the same visible confirmation and server checks as the UI.</p>
          </div>
        </div>
      </section>

      <section className="section public-profile" aria-labelledby="public-profile-heading">
        <header className="section-heading">
          <div className="section-heading__lead">
            <p className="eyebrow">Free public Gym profile</p>
            <h2 className="section-title" id="public-profile-heading">
              Plan a visit without an account.
            </h2>
          </div>
          <div className="section-heading__aside">
            <p className="page-intro">
              These are the same public operating facts exposed through WebMCP. No Passport or
              payment is required.
            </p>
            <span className="pill pill--free">
              <span className="status-dot is-active" /> Free to read · no sign-up
            </span>
          </div>
        </header>
        <div className="public-profile-grid">
          <article className="fact-card">
            <div className="fact-card__top">
              <span className="fact-card__icon">
                <Clock3 size={19} aria-hidden="true" />
              </span>
              <span className="fact-card__count">{gymProfile.services.length} services</span>
            </div>
            <h3>Hours &amp; services</h3>
            <p className="fact-card__lede">{gymProfile.hours}</p>
            <ul className="fact-list">
              {gymProfile.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
            <Link className="fact-card__link" href="/session">
              See staff walkthroughs <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </article>
          <article className="fact-card">
            <div className="fact-card__top">
              <span className="fact-card__icon">
                <Accessibility size={19} aria-hidden="true" />
              </span>
              <span className="fact-card__count">
                {gymProfile.accessFeatures.length} documented
              </span>
            </div>
            <h3>Accessibility</h3>
            <ul className="fact-list">
              {gymProfile.accessFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link className="fact-card__link" href="/equipment">
              Check setup and access details <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </article>
          <article className="fact-card">
            <div className="fact-card__top">
              <span className="fact-card__icon">
                <ClipboardCheck size={19} aria-hidden="true" />
              </span>
              <span className="fact-card__count">{gymProfile.rules.length} published</span>
            </div>
            <h3>Ground rules</h3>
            <ul className="fact-list">
              {gymProfile.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <Link className="fact-card__link" href="/passport">
              See the privacy boundary <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <section className="section sample-walkthrough" aria-labelledby="sample-heading">
        <aside className="sample-feature">
          <p className="eyebrow">Generic sample · Free</p>
          <h2 className="section-title" id="sample-heading">
            {sample.name}
          </h2>
          <p className="sample-feature__copy">
            This non-personalized sample is published by Gym staff and available without a Passport
            or payment. Connecting context only happens if you later request a personalized Routine
            Pro result.
          </p>
          <p className="sample-feature__bestfor">
            <span>Best for</span>
            {sample.bestFor}
          </p>
          <dl className="sample-feature__meta">
            <div>
              <dt>Duration</dt>
              <dd>{sample.durationMinutes} min</dd>
            </div>
            <div>
              <dt>Stations</dt>
              <dd>{sample.stations.length}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>v{sample.version}</dd>
            </div>
          </dl>
          <p className="sample-feature__author">
            <UsersRound size={14} aria-hidden="true" /> Published by {sample.staffAuthor}
          </p>
          <Link href="/session" className="sample-feature__link">
            See all staff walkthroughs <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </aside>
        <div className="sample-track">
          <ol className="sample-stations" aria-label="Generic sample stations">
            {sample.stations.map((station, index) => {
              const item = equipmentById.get(station.equipmentId);
              return (
                <li className="station-row" key={station.equipmentId}>
                  <span className="station-row__index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item ? (
                    <span className="station-row__thumb">
                      <Image src={item.imageUrl} alt={uiEquipmentAlt(item)} fill sizes="72px" />
                    </span>
                  ) : null}
                  <div className="station-row__body">
                    <h3>{item ? uiEquipmentName(item) : station.equipmentId}</h3>
                    <p>{station.reason}</p>
                    <span className="station-row__meta">
                      <span className="chip">
                        <Clock3 size={12} aria-hidden="true" /> {station.minutes} min
                      </span>
                      {item ? <span className="chip chip--quiet">{item.locationZone}</span> : null}
                      {item ? (
                        <span className="chip chip--quiet">{uiEquipmentManufacturer}</span>
                      ) : null}
                    </span>
                  </div>
                  {item ? (
                    <Link
                      className="station-row__link"
                      href={`/equipment/${item.slug}`}
                      aria-label={`View ${uiEquipmentName(item)}`}
                    >
                      <span>View equipment</span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="sample-upsell">
            <div>
              <strong>Want this shaped around your approved context?</strong>
              <p>
                Routine Pro saves a routine to your Passport: one your agent generates from the
                projection you approve and our verified inventory, or this staff walkthrough
                grounded in that projection. One confirmed sandbox write · {routineProPrice}.
              </p>
            </div>
            <Link className="button button--dark button--small" href="/session">
              Request Routine Pro <Sparkles size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="section club-experience" aria-labelledby="experience-heading">
        <header className="section-heading">
          <div className="section-heading__lead">
            <p className="eyebrow">What a member actually does</p>
            <h2 className="section-title" id="experience-heading">
              A credible first-visit flow.
            </h2>
          </div>
          <div className="section-heading__aside">
            <p className="page-intro">
              The site remains useful without an agent. With WebMCP, the same pages become a
              structured surface for discovery, matching, confirmation, and feedback.
            </p>
          </div>
        </header>
        <ol className="experience-grid">
          <li className="experience-card">
            <div className="experience-card__top">
              <span className="experience-card__icon">
                <Fingerprint size={20} aria-hidden="true" />
              </span>
              <span className="experience-card__num" aria-hidden="true">
                01
              </span>
            </div>
            <h3>Bring approved context</h3>
            <p>Review the exact projection in Passport, then enter through a one-use handoff.</p>
            <Link href="/passport">
              See the privacy boundary <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
          <li className="experience-card">
            <div className="experience-card__top">
              <span className="experience-card__icon">
                <UsersRound size={20} aria-hidden="true" />
              </span>
              <span className="experience-card__num" aria-hidden="true">
                02
              </span>
            </div>
            <h3>Bring your agent, or choose a walkthrough</h3>
            <p>
              Your agent generates a personalized routine through WebMCP; without one, select a
              published walkthrough. Context keeps relevant setup notes visible.
            </p>
            <Link href="/session">
              Build a session <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
          <li className="experience-card">
            <div className="experience-card__top">
              <span className="experience-card__icon">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <span className="experience-card__num" aria-hidden="true">
                03
              </span>
            </div>
            <h3>Verify every station</h3>
            <p>See the exact model, Gym zone, source page, template version, and decision trace.</p>
            <Link href="/equipment">
              Browse verified products <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
        </ol>
      </section>

      <section className="home-cta home-cta--club">
        <div className="home-cta__copy">
          <p className="eyebrow">WebMCP, made inspectable</p>
          <h2 className="section-title">
            Ask an agent to find a model or select a published tour.
          </h2>
          <p>
            The execution drawer shows whether WebMCP was actually available and which handler ran.
          </p>
        </div>
        <div className="home-cta__panel">
          <p className="home-cta__price">
            <strong>{routineProPrice}</strong>
            <span>Routine Pro · sandbox only, no real funds</span>
          </p>
          <div className="home-cta__actions">
            <Link className="button button--dark" href="/session">
              Open member flow <Sparkles size={17} aria-hidden="true" />
            </Link>
            <Link className="button button--ghost home-cta__ghost" href="/equipment">
              Browse free catalog <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
