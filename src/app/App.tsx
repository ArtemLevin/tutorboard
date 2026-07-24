import { readEnvironment } from "./configuration/environment";
import "./styles.css";

const environment = readEnvironment();

const foundations = [
  {
    name: "Board Core",
    detail: "Сериализуемая модель доски появится в следующем этапе.",
  },
  {
    name: "Feature Modules",
    detail: "Возможности подключаются через проверяемые публичные контракты.",
  },
  {
    name: "External Adapters",
    detail: "Canvas, GeometryOS и persistence остаются заменяемыми.",
  },
] as const;

export function App() {
  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <span className="eyebrow">Architecture foundation</span>
        <h1 id="page-title">TutorBoard</h1>
        <p className="hero-copy">
          Интерактивное образовательное полотно с независимыми доменной моделью,
          модулями и технологическими адаптерами.
        </p>
        <span className="stage-badge">Среда: {environment.stage}</span>
      </section>

      <section className="foundation-grid" aria-label="Границы архитектуры">
        {foundations.map((foundation) => (
          <article className="foundation-card" key={foundation.name}>
            <h2>{foundation.name}</h2>
            <p>{foundation.detail}</p>
          </article>
        ))}
      </section>

      <footer>
        <span className="status-dot" aria-hidden="true" />
        Repository foundation ready
      </footer>
    </main>
  );
}
