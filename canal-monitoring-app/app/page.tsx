"use client";

import Navbar from "../src/components/Navbar";
import WhatIsWebsite from "../src/components/WhatIsWebsite";
import Footer from "../src/components/Footer";
import OurSolution from "../src/components/OurSolution";
import CanalMap from "@/components/map/CanalMap"
import HomeCanalMap from "@/components/map/HomeCanalMap";


export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Map Section */}
      <section className="h-[60vh] border-b MB-7 overflow-auto">
        <HomeCanalMap />
      </section>

      <WhatIsWebsite />
      <OurSolution />
      <Footer />
    </div>
  );
}