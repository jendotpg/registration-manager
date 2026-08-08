import { useState } from 'react';
import {
  Checkbox,
  Collapse,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Stack,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import {
  Id,
  nextNullableBoolean,
  NullableBoolean,
  Pool,
  poolLabel,
} from '../common/types';

function CyclingCheckbox({
  label,
  state,
  onChange,
}: {
  label: string;
  state: NullableBoolean;
  onChange: (next: NullableBoolean) => void;
}) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={state === NullableBoolean.Include}
          indeterminate={state === NullableBoolean.Indeterminate}
          onChange={() => onChange(nextNullableBoolean(state))}
        />
      }
      label={label}
    />
  );
}

export function PaidMenu({
  anchorEl,
  open,
  onClose,
  paidState,
  onPaidChange,
}: {
  anchorEl: Element | null;
  open: boolean;
  onClose: () => void;
  paidState: NullableBoolean;
  onPaidChange: (next: NullableBoolean) => void;
}) {
  return (
    <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
      <MenuItem disableRipple>
        <CyclingCheckbox
          label="Paid"
          state={paidState}
          onChange={onPaidChange}
        />
      </MenuItem>
    </Menu>
  );
}

export function AddedMenu({
  anchorEl,
  open,
  onClose,
  addedState,
  onAddedChange,
  poolOptions,
  pools,
  onPoolsChange,
}: {
  anchorEl: Element | null;
  open: boolean;
  onClose: () => void;
  addedState: NullableBoolean;
  onAddedChange: (next: NullableBoolean) => void;
  poolOptions: Pool[];
  pools: Record<Id, boolean>;
  onPoolsChange: (pools: Record<Id, boolean>) => void;
}) {
  const [poolsExpanded, setPoolsExpanded] = useState(true);

  const checkedPoolCount = poolOptions.filter((pool) => pools[pool.id]).length;
  const allPoolsChecked =
    poolOptions.length > 0 && checkedPoolCount === poolOptions.length;
  const somePoolsChecked = checkedPoolCount > 0 && !allPoolsChecked;

  return (
    <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
      <MenuItem disableRipple>
        <CyclingCheckbox
          label="Added"
          state={addedState}
          onChange={onAddedChange}
        />
      </MenuItem>
      <MenuItem disableRipple>
        <Stack direction="row" alignItems="center" sx={{ width: '100%' }}>
          <FormControlLabel
            sx={{ flexGrow: 1 }}
            control={
              <Checkbox
                checked={allPoolsChecked}
                indeterminate={somePoolsChecked}
                onChange={() => {
                  const selectAll = !allPoolsChecked;
                  const next: Record<Id, boolean> = {};
                  poolOptions.forEach((pool) => {
                    next[pool.id] = selectAll;
                  });
                  onPoolsChange(next);
                }}
              />
            }
            label="Pools"
          />
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              setPoolsExpanded(!poolsExpanded);
            }}
          >
            {poolsExpanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Stack>
      </MenuItem>
      <Collapse in={poolsExpanded} sx={{ maxHeight: 240, overflowY: 'auto' }}>
        {poolOptions.map((pool) => (
          <MenuItem key={pool.id} disableRipple sx={{ paddingLeft: '32px' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!pools[pool.id]}
                  onChange={() =>
                    onPoolsChange({ ...pools, [pool.id]: !pools[pool.id] })
                  }
                />
              }
              label={poolLabel(pool)}
            />
          </MenuItem>
        ))}
      </Collapse>
    </Menu>
  );
}
