import { Link } from 'react-router';
import { openExternal } from '../lib/desktop';
import { tmdbImage } from '../lib/format';
import type { CastMember, Provider, Providers } from '../lib/types';
import { Icon } from './Icon';
import { Row } from './Row';

export function CastRow({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;
  return (
    <Row title="Cast" variant="cast">
      {cast.map((c) => {
        const img = tmdbImage(c.profile, 'w185');
        return (
          <Link key={c.id} to={`/person/${c.id}`} className="person">
            <span className="person__photo">
              {img ? <img src={img} alt="" loading="lazy" /> : <Icon name="user" size={28} />}
            </span>
            <span className="person__name">{c.name}</span>
            {c.character && <span className="person__role">{c.character}</span>}
          </Link>
        );
      })}
    </Row>
  );
}

function ProviderGroup({ label, list }: { label: string; list: Provider[] }) {
  if (list.length === 0) return null;
  return (
    <div className="providers__group">
      <p className="providers__label">{label}</p>
      <ul className="providers__list">
        {list.map((p) => {
          const logo = tmdbImage(p.logo, 'w92');
          return (
            <li key={p.id} className="provider" title={p.name}>
              {logo ? <img src={logo} alt="" loading="lazy" /> : <span>{p.name.slice(0, 2)}</span>}
              <span className="provider__name">{p.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WhereToWatch({ providers, region }: { providers: Providers | null; region: string }) {
  return (
    <section className="section page-pad" aria-labelledby="wtw-title">
      <div className="section__head">
        <h2 className="section__title" id="wtw-title">
          Where to watch
        </h2>
        <span className="section__hint">
          <Icon name="globe" size={14} /> {region}
        </span>
      </div>
      {providers ? (
        <div className="providers">
          <ProviderGroup label="Stream" list={providers.stream} />
          <ProviderGroup label="Free" list={providers.free} />
          <ProviderGroup label="With ads" list={providers.ads} />
          <ProviderGroup label="Rent" list={providers.rent} />
          <ProviderGroup label="Buy" list={providers.buy} />
          <p className="providers__foot">
            Availability by JustWatch.{' '}
            {providers.link && (
              <button type="button" className="link" onClick={() => openExternal(providers.link!)}>
                See all options <Icon name="external" size={12} />
              </button>
            )}
          </p>
        </div>
      ) : (
        <p className="muted">No streaming info for your region yet. You can change your region in Settings.</p>
      )}
    </section>
  );
}

export function Facts({ items }: { items: Array<[string, React.ReactNode]> }) {
  const visible = items.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (visible.length === 0) return null;
  return (
    <dl className="facts">
      {visible.map(([k, v]) => (
        <div key={k} className="facts__item">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PeopleLinks({ people }: { people: Array<{ id: number; name: string }> }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <Link to={`/person/${p.id}`} className="link">
            {p.name}
          </Link>
        </span>
      ))}
    </>
  );
}
