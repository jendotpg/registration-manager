import { cloneElement, MouseEvent, ReactElement, useState } from 'react';
import { Tooltip } from '@mui/material';
import { TOOLTIP_ENTER_DELAY_MS } from './checkinMetrics';

export default function EllipsisTooltip({
  title,
  children,
}: {
  title: string;
  children: ReactElement;
}) {
  const [overflowed, setOverflowed] = useState(false);
  return (
    <Tooltip
      enterDelay={TOOLTIP_ENTER_DELAY_MS}
      title={overflowed ? title : ''}
    >
      {cloneElement(children, {
        onMouseEnter: (event: MouseEvent<HTMLElement>) => {
          const el = event.currentTarget;
          setOverflowed(el.scrollWidth > el.clientWidth);
        },
      })}
    </Tooltip>
  );
}
