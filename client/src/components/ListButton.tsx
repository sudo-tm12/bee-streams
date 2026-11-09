import { isInList, toggleInList, useMyList, type ListItemInput } from '../lib/library';
import { Icon } from './Icon';
import { useToast } from './Toasts';

interface Props {
  item: ListItemInput;
  variant?: 'button' | 'icon';
  className?: string;
}

/** "My List" toggle — full button on detail pages, round icon on cards. */
export function ListButton({ item, variant = 'button', className = '' }: Props) {
  const list = useMyList();
  const toast = useToast();
  const added = isInList(list, item.mediaType, item.tmdbId);
  const label = added ? 'Remove from My List' : 'Add to My List';

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const nowAdded = toggleInList(item);
    toast.show(nowAdded ? `Added “${item.title}” to My List` : `Removed “${item.title}” from My List`, {
      icon: nowAdded ? 'check' : 'x',
      action: { label: 'Undo', onClick: () => toggleInList(item) },
    });
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`icon-btn icon-btn--glass${added ? ' is-on' : ''} ${className}`}
        onClick={onClick}
        aria-pressed={added}
        aria-label={label}
        title={label}
      >
        <Icon name={added ? 'check' : 'plus'} size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn--ghost${added ? ' is-on' : ''} ${className}`}
      onClick={onClick}
      aria-pressed={added}
    >
      <Icon name={added ? 'check' : 'plus'} size={18} />
      {added ? 'In My List' : 'My List'}
    </button>
  );
}
