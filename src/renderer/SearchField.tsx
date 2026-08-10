import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { TextField } from '@mui/material';

export const SEARCH_DEBOUNCE_MS = 200;

export default function SearchField({
  searchText,
  setSearchText,
}: {
  searchText: string;
  setSearchText: (val: string) => void;
}) {
  const [value, setValue] = useState(searchText);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The last text handed upwards, so a real external change is recognisable. */
  const reported = useRef(searchText);

  const cancel = () => {
    if (timeout.current !== undefined) {
      clearTimeout(timeout.current);
      timeout.current = undefined;
    }
  };

  const report = (next: string) => {
    cancel();
    reported.current = next;
    setSearchText(next);
  };

  useEffect(
    () => () => {
      if (timeout.current !== undefined) {
        clearTimeout(timeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (searchText !== reported.current) {
      reported.current = searchText;
      cancel();
      setValue(searchText);
    }
  }, [searchText]);

  return (
    <TextField
      label="Search players"
      id="search-bar"
      name="search-bar"
      placeholder="TSM|Leffen"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        cancel();
        if (next === '') {
          report('');
          return;
        }
        timeout.current = setTimeout(() => {
          timeout.current = undefined;
          report(next);
        }, SEARCH_DEBOUNCE_MS);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          report(value);
        }
      }}
      size="small"
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 0,
      }}
    />
  );
}
