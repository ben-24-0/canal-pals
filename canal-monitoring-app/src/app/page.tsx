"use client";

import Navbar from "../components/Navbar";
import OurSolution from "../components/OurSolution";
import Footer from "../components/Footer";
import WhatIsWebsite from "../components/WhatIsWebsite";


import CanalMap from "@/components/map/CanalMap";
import HomeCanalMap from "@/components/map/HomeCanalMap";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      {/* Map Section */}
      <section className="w-full min-h-[300px] md:h-[60vh] border-b-4 border-primary flex items-center justify-center">
        <div className="w-full h-full rounded-xl shadow-lg bg-card flex items-center justify-center">
          <div className="w-full h-[300px] md:h-[50vh] lg:h-[60vh]">
            <HomeCanalMap />
          </div>
        </div>
      </section>

      <div className="flex flex-col md:flex-row gap-8 px-8 py-12 items-center justify-center">
        <div className="w-full md:w-1/2 bg-card p-8 rounded-xl shadow-md border border-primary">
          <WhatIsWebsite />
        </div>
        <div className="w-full md:w-1/2 bg-card p-8 rounded-xl shadow-md border border-primary">
          <OurSolution />
        </div>
      </div>

      <Footer />
    </div>
  );
}
