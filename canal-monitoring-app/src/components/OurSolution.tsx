export default function OurSolution() {
  return (
    <section className="py-16 bg-card border-t">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-2xl font-semibold mb-4 text-primary">
          Our Solution
        </h2>
        <div className="text-foreground leading-relaxed space-y-4">
          <p>
            Manual canal monitoring leads to water wastage, delayed response to issues, and crop losses due to lack of real-time data. Our platform addresses this by providing a semi-portable, automated canal discharge monitoring system—a "digital eye" for water authorities.
          </p>
          <ul className="list-disc pl-6">
            <li>
              <b>Level-Based Estimation:</b> Uses ultrasonic sensors and Manning’s Equation for cost-effective monitoring.
            </li>
            <li>
              <b>Velocity-Based Measurement:</b> Employs Doppler radar for high-precision discharge at critical points.
            </li>
            <li>
              <b>Additional Features:</b> Solar power, LoRaWAN connectivity, and a secure, interactive dashboard for real-time data and decision support.
            </li>
          </ul>
          <p>
            This solution enables continuous, remote monitoring, rapid response to issues, and efficient water management—reducing losses and improving crop outcomes.
          </p>
        </div>
      </div>
    </section>
  );
}
