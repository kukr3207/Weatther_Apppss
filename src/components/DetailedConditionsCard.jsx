import { detailedConditions } from '../domain/weatherDetails';

function DetailedConditionsCard({ weather }) {
  const details = detailedConditions(weather);
  if (!details) return null;

  return (
    <section className="workspace-panel details-panel" aria-labelledby="details-title">
      <div className="workspace-panel__heading">
        <div>
          <p>What the readings mean</p>
          <h2 id="details-title">Condition details</h2>
        </div>
      </div>
      <div className="condition-detail-grid">
        {details.cards.map((card) => (
          <article key={card.id}>
            <span aria-hidden="true">
              {card.id === 'wind-force' ? '≈' : card.id === 'pressure' ? '↕' : card.id === 'visibility' ? '◉' : '〰'}
            </span>
            <div>
              <h3>{card.title}</h3>
              <p>{card.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default DetailedConditionsCard;
