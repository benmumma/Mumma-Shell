import { test, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MummaHeader } from '../src/header/MummaHeader';

// Recorded against the header BEFORE the whatsNew prop existed: a consumer
// that does not pass `whatsNew` must get byte-identical markup.
test('header markup is unchanged for consumers without whatsNew', () => {
  const { container } = render(
    <MummaHeader appName="Forward" appKey="forward" dekkoUrl="https://dekko.mumma.co"
      actions={<button type="button">Quick Add</button>} />
  );
  expect(container.innerHTML).toMatchSnapshot('bar');
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  expect(container.innerHTML).toMatchSnapshot('gear-open');
});
