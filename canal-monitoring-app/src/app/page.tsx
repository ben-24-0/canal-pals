"use client";

import Navbar from "../components/Navbar";
import OurSolution from "../components/OurSolution";
import Footer from "../components/Footer";
import WhatIsWebsite from "../components/WhatIsWebsite";


import CanalMap from "@/components/map/CanalMap";
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
