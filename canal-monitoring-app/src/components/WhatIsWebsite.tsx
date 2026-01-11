export default function WhatIsWebsite() {
  return (
    <section id="about-section" className="py-16 bg-white border-t">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-2xl font-semibold mb-8">What Is This Platform?</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="border rounded p-6">
            <h3 className="font-semibold mb-2">Centralized Visibility</h3>
            <p className="text-sm text-gray-600">
              A single interface to visualize irrigation canal infrastructure
              and key operational data.
            </p>
          </div>

          <div className="border rounded p-6">
            <h3 className="font-semibold mb-2">Data-Driven Monitoring</h3>
            <p className="text-sm text-gray-600">
              Enables tracking of canal status, flow conditions, and system
              health using geospatial data.
            </p>
          </div>

          <div className="border rounded p-6">
            <h3 className="font-semibold mb-2">Decision Support</h3>
            <p className="text-sm text-gray-600">
              Designed to support planning, inspection, and long-term water
              management decisions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
