"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  ChartNoAxesColumn,
  ShieldCheck,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const monitoredCanals = ["Ezhattumugam Irrigation Canal"];

const heroImages = [
  "/Dewatermark_1774199757142.png",
  "/Gemini_Generated_Image_ca4y4aca4y4aca4y.png",
];

const governanceCards = [
  {
    title: "Real-Time Monitoring",
    text: "Continuous canal telemetry replaces manual site visits, so discharge anomalies are detected quickly and acted on early.",
    icon: Activity,
  },
  {
    title: "Dual-Sensor Intelligence",
    text: "Ultrasonic depth estimates are cross-checked against Doppler-measured actual flow for blockage insight.",
    icon: Building2,
  },
  {
    title: "Semi-Portable Field Design",
    text: "Clamp-based, relocatable deployment allows one unit to be moved between critical canal sections as monitoring needs change.",
    icon: ChartNoAxesColumn,
  },
  {
    title: "Low-Cost Scalability",
    text: "Off-the-shelf electronics and solar-backed operation enable practical scale-up across public irrigation networks.",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  const [activeCanalIndex, setActiveCanalIndex] = useState(0);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveCanalIndex((prev) => (prev + 1) % monitoredCanals.length);
    }, 2800);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const heroTimer = window.setInterval(() => {
      setActiveHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 4200);

    return () => window.clearInterval(heroTimer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <section className="relative h-[50vh] w-full overflow-hidden">
        {heroImages.map((image, index) => (
          <div
            key={image}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
              index === activeHeroIndex ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundImage: `url('${image}')` }}
          />
        ))}

        <div className="absolute inset-0 bg-black/25" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl items-end px-5 pb-8 pt-24 md:px-10 md:pb-10">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] md:text-5xl">
              Intelligent Irrigation Monitoring System
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.45)] md:text-base">
              An Intelligent Irrigation Management System combining hydraulic
              engineering and embedded sensing to deliver live flow visibility,
              faster blockage detection, and better water allocation decisions.
            </p>
            {/* <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0d3a6b] hover:bg-blue-100"
              >
                Officer Login
              </Link>
              <Link
                href="/map"
                className="rounded-lg border border-white px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Open Water Structures Map
              </Link>
            </div> */}
          </div>
        </div>

        <div className="absolute bottom-4 right-5 z-20 flex gap-2 md:right-10">
          {heroImages.map((image, index) => (
            <button
              key={`${image}-dot`}
              type="button"
              onClick={() => setActiveHeroIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                index === activeHeroIndex
                  ? "bg-white"
                  : "bg-white/45 hover:bg-white/75"
              }`}
              aria-label={`Show hero image ${index + 1}`}
            />
          ))}
        </div>
      </section>

      <section className="w-full border-y border-[#9fb6cf] bg-[#0f3f73] py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 md:px-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-100">
            Currently Monitoring Canals
          </p>
          <div className="min-h-10 text-2xl font-semibold text-white md:text-3xl">
            {monitoredCanals[activeCanalIndex]}
          </div>
          <div className="hidden flex-wrap gap-2 pt-1 md:flex">
            {monitoredCanals.map((canal, index) => (
              <span
                key={canal}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  index === activeCanalIndex
                    ? "bg-white text-[#0d3a6b]"
                    : "bg-white/20 text-blue-100"
                }`}
              >
                {canal}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="w-full bg-[#edf3f9] py-14">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#1a4f84]">
              Service Overview
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#0d3a6b] md:text-3xl">
              Public Water Infrastructure Intelligence
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {governanceCards.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="border-b border-[#b8c9db] pb-4"
                >
                  <div className="mb-3 inline-flex text-[#0d3a6b]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#0d3a6b]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#3b5e82]">
                    {item.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="w-full bg-[#dbe7f3] py-14">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-[1.1fr_1fr] md:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#1a4f84]">
              Mapping Desk
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#0d3a6b] md:text-3xl">
              Water Structures and River Basin Visual Maps
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#355a80] md:text-base">
              A practical operations desk for irrigation authorities to view
              monitored assets, inspect live status, and support time-sensitive
              field decisions with one shared interface.
            </p>
            <Link
              href="/map"
              className="mt-6 inline-flex rounded-lg bg-[#0f3f73] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b315a]"
            >
              Go to Map Page
            </Link>
          </div>

          <div className="py-1">
            <div
              className="h-74 w-full bg-cover bg-bottom"
              style={{ backgroundImage: "url('/Kerala_WS.png')" }}
            />
            <p className="pt-3 text-xs text-[#44698d]">
              Preview placeholder for the incoming water structures and rivers
              map image set.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-[#0d355f] py-6 text-center text-sm text-blue-100">
        Irrigation Department | Canal Monitoring and Decision Support Interface
      </section>

      <Footer />
    </div>
  );
}
