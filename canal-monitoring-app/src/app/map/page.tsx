"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const mapSheets = [
  {
    id: "water-structures",
    title: "Water Structures (Dams/Barrages/Weirs/Regulators)",
    basin: "Select",
    image: "/Kerala_WS.png",
  },
  {
    id: "bharathapuzha",
    title: "Bharathapuzha Basin Structures",
    basin: "Bharathapuzha",
    image: "/Dewatermark_1774199757142.png",
  },
  {
    id: "pamba",
    title: "Pamba Basin Structures",
    basin: "Pamba",
    image: "/Dewatermark_1774199757142.png",
  },
  {
    id: "neyyar",
    title: "Neyyar Basin Structures",
    basin: "Neyyar",
    image: "/Dewatermark_1774199757142.png",
  },
];

export default function PublicMapPage() {
  const [selectedId, setSelectedId] = useState(mapSheets[0].id);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const selectedMap =
    mapSheets.find((sheet) => sheet.id === selectedId) ?? mapSheets[0];

  const clampZoom = (value: number) => Math.min(4, Math.max(1, value));

  const zoomIn = () => setZoom((prev) => clampZoom(prev + 0.2));
  const zoomOut = () => setZoom((prev) => clampZoom(prev - 0.2));
  const resetZoom = () => setZoom(1);

  const onWheelZoom: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    setZoom((prev) => clampZoom(prev + delta));
  };

  return (
    <div className="min-h-screen bg-[#edf3f9] text-[#0d3a6b]">
      <Navbar />

      <main className="mx-auto w-full max-w-375 px-3 pb-12 pt-20 sm:px-4 md:px-8 md:pt-24">
        <header className="mb-6 rounded-xl border border-[#b5c9dc] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1a4f84]">
            Public Map Desk
          </p>
          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            Water Structures and Rivers Map
          </h1>
          <p className="mt-2 text-sm text-[#3a5f84]">
            JPG map sheets placeholder view. Replace image paths in this page
            with your official basin map files when ready.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border border-[#b5c9dc] bg-[#dfe9f4] p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Water Structure</h2>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#40688f]">
              Basin Selector
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mb-4 w-full rounded-md border border-[#b4c7da] bg-white px-3 py-2 text-sm"
            >
              {mapSheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.basin}
                </option>
              ))}
            </select>

            <div className="space-y-2 rounded-md border border-[#b5c9dc] bg-white p-3 text-sm">
              <p className="font-semibold text-[#0d3a6b]">Map Layer Notes</p>
              <p className="text-[#3f6387]">
                - Water structures overview\n- River basin boundaries\n- Structure
                reference labels
              </p>
            </div>
          </aside>

          <div className="rounded-xl border border-[#b5c9dc] bg-white p-2.5 shadow-sm sm:p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1.5 sm:px-2">
              <h3 className="text-base font-semibold md:text-lg">
                {selectedMap.title}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsViewerOpen(true);
                  resetZoom();
                }}
                className="rounded-md border border-[#a7bed4] px-3 py-1 text-xs text-[#275786] hover:bg-[#edf3f9]"
              >
                Click for enlarged view
              </button>
            </div>

            <div className="h-[62vh] min-h-90 w-full overflow-hidden rounded-lg border border-[#b8cade] bg-[#f0f5fb] sm:h-[68vh] md:h-[74vh] md:min-h-130">
              <img
                src={selectedMap.image}
                alt={selectedMap.title}
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </section>
      </main>

      {isViewerOpen && (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setIsViewerOpen(false)}
        >
          <div
            className="relative flex h-[92vh] w-full max-w-7xl flex-col rounded-xl border border-[#a8bfd6] bg-[#f4f8fc]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2 border-b border-[#bcd0e2] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <p className="text-xs font-semibold text-[#0d3a6b] sm:text-sm">
                {selectedMap.title}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={zoomOut}
                  className="rounded border border-[#a7bed4] px-2 py-1 text-xs text-[#1d4f7f] hover:bg-[#e7f0f9]"
                >
                  -
                </button>
                <span className="w-14 text-center text-xs text-[#1d4f7f]">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="rounded border border-[#a7bed4] px-2 py-1 text-xs text-[#1d4f7f] hover:bg-[#e7f0f9]"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="rounded border border-[#a7bed4] px-2 py-1 text-xs text-[#1d4f7f] hover:bg-[#e7f0f9]"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsViewerOpen(false)}
                  className="rounded border border-[#a7bed4] px-2 py-1 text-xs text-[#1d4f7f] hover:bg-[#e7f0f9]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto bg-[#edf3f9]" onWheel={onWheelZoom}>
              <div className="flex h-full w-full items-center justify-center p-4">
                <img
                  src={selectedMap.image}
                  alt={selectedMap.title}
                  className="max-h-full max-w-full object-contain transition-transform duration-150"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
