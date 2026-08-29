import { equipmentCatalog } from "@adaptive-world/demo-data";
import Image from "next/image";
import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { gymProfile } from "@/lib/gym-profile";
import { facilityTemplates } from "@/lib/session-planner";

export default function HomePage() {
  const sample = facilityTemplates[0]!;
  const equipmentById = new Map(equipmentCatalog.map((item) => [item.id, item]));

  return (
    <div className="page-wrap home-page">
      <section className="club-hero" aria-labelledby="hero-title">
        <div className="club-hero__media">
          <Image
            src="/images/adaptive-gym-floor.svg"
            alt="Illustrated Adaptive Gym floor with cardio, cable, and free-weight zones"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 58vw"
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
            <strong>Real product models. Synthetic club inventory.</strong>
          </div>
        </div>
        <div className="club-hero__copy">
          <p className="eyebrow">A consent-first member experience</p>
          <h1 className="display-title" id="hero-title">
            Your first visit, already <em>better prepared.</em>
          </h1>
          <p className="page-intro">
            Browse the club normally, or bring a minimum projection from your Digital Passport. We
            match it to published staff walkthroughs and manufacturer-verified equipment—not an
            invented AI routine.
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
              <strong>12</strong>
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
            <p>Every model links to its manufacturer specification page.</p>
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
        <div className="section-heading">
          <div>
            <p className="eyebrow">Free public Gym profile</p>
            <h2 className="section-title" id="public-profile-heading">
              Plan a visit without an account.
            </h2>
          </div>
          <p className="page-intro">
            These are the same public operating facts exposed through WebMCP. No Passport or payment
            is required.
          </p>
        </div>
        <div className="public-profile-grid">
          <article className="public-profile-card card">
            <Clock3 size={22} aria-hidden="true" />
            <h3>Hours & services</h3>
            <p>{gymProfile.hours}</p>
            <ul>
              {gymProfile.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </article>
          <article className="public-profile-card card">
            <Accessibility size={22} aria-hidden="true" />
            <h3>Accessibility</h3>
            <ul>
              {gymProfile.accessFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </article>
          <article className="public-profile-card card">
            <ClipboardCheck size={22} aria-hidden="true" />
            <h3>Ground rules</h3>
            <ul>
              {gymProfile.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section sample-walkthrough" aria-labelledby="sample-heading">
        <div className="sample-walkthrough__intro">
          <p className="eyebrow">Generic sample · Free</p>
          <h2 className="section-title" id="sample-heading">
            {sample.name}
          </h2>
          <p>
            This non-personalized sample is published by Gym staff and available without a Passport
            or payment. Connecting context only happens if you later request a personalized Routine
            Pro result.
          </p>
          <span>
            <Clock3 size={15} aria-hidden="true" /> {sample.durationMinutes} minutes · Template v
            {sample.version}
          </span>
        </div>
        <ol className="sample-stations" aria-label="Generic sample stations">
          {sample.stations.map((station, index) => {
            const item = equipmentById.get(station.equipmentId);
            return (
              <li key={station.equipmentId}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{item?.name ?? station.equipmentId}</h3>
                  <p>
                    {station.minutes} minutes · {station.reason}
                  </p>
                </div>
                {item ? (
                  <Link href={`/equipment/${item.slug}`} aria-label={`View ${item.name}`}>
                    <Dumbbell size={16} aria-hidden="true" /> View equipment
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="section club-experience" aria-labelledby="experience-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">What a member actually does</p>
            <h2 className="section-title" id="experience-heading">
              A credible first-visit flow.
            </h2>
          </div>
          <p className="page-intro">
            The site remains useful without an agent. With WebMCP, the same pages become a
            structured surface for discovery, matching, confirmation, and feedback.
          </p>
        </div>
        <div className="experience-grid">
          <article className="experience-card">
            <span>01</span>
            <Fingerprint size={24} />
            <h3>Bring approved context</h3>
            <p>Review the exact projection in Passport, then enter through a one-use handoff.</p>
            <Link href="/passport">
              See the privacy boundary <ArrowRight size={14} />
            </Link>
          </article>
          <article className="experience-card">
            <span>02</span>
            <UsersRound size={24} />
            <h3>Choose a staff walkthrough</h3>
            <p>Select a published orientation; context helps keep relevant setup notes visible.</p>
            <Link href="/session">
              View walkthroughs <ArrowRight size={14} />
            </Link>
          </article>
          <article className="experience-card">
            <span>03</span>
            <CheckCircle2 size={24} />
            <h3>Verify every station</h3>
            <p>See the exact model, Gym zone, source page, template version, and decision trace.</p>
            <Link href="/equipment">
              Browse verified products <ArrowRight size={14} />
            </Link>
          </article>
        </div>
      </section>

      <section className="section home-cta home-cta--club">
        <div>
          <p className="eyebrow">WebMCP, made inspectable</p>
          <h2 className="section-title">
            Ask an agent to find a model or select a published tour.
          </h2>
          <p>
            The execution drawer shows whether WebMCP was actually available and which handler ran.
          </p>
        </div>
        <Link className="button button--dark" href="/session">
          Open member flow <Sparkles size={17} />
        </Link>
      </section>
    </div>
  );
}
