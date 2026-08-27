import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Fingerprint,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="page-wrap home-page">
      <section className="club-hero" aria-labelledby="hero-title">
        <div className="club-hero__media">
          <Image
            src="/images/adaptive-gym-floor-1600.webp"
            alt="Bright modern Adaptive Gym training floor with cardio and strength zones"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 58vw"
          />
          <div className="club-hero__overlay" />
          <div className="club-status">
            <span className="status-dot is-active" />
            Demo club open · 06:00–22:00
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
