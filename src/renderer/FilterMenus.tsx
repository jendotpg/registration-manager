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
import { nextNullableBoolean, NullableBoolean } from '../common/types';

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
  dqdState,
  onDqdChange,
  pools,
  onPoolsChange,
}: {
  anchorEl: Element | null;
  open: boolean;
  onClose: () => void;
  addedState: NullableBoolean;
  onAddedChange: (next: NullableBoolean) => void;
  dqdState: NullableBoolean;
  onDqdChange: (next: NullableBoolean) => void;
  pools: Record<string, boolean>;
  onPoolsChange: (pools: Record<string, boolean>) => void;
}) {
  const [poolsExpanded, setPoolsExpanded] = useState(true);

  const poolNames = Object.keys(pools);
  const checkedPoolCount = poolNames.filter((name) => pools[name]).length;
  const allPoolsChecked =
    poolNames.length > 0 && checkedPoolCount === poolNames.length;
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
        <CyclingCheckbox label="DQ'd" state={dqdState} onChange={onDqdChange} />
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
                  const next: Record<string, boolean> = {};
                  poolNames.forEach((name) => {
                    next[name] = selectAll;
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
      <Collapse in={poolsExpanded}>
        {poolNames.map((name) => (
          <MenuItem key={name} disableRipple sx={{ paddingLeft: '32px' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={pools[name]}
                  onChange={() =>
                    onPoolsChange({ ...pools, [name]: !pools[name] })
                  }
                />
              }
              label={name}
            />
          </MenuItem>
        ))}
      </Collapse>
    </Menu>
  );
}
