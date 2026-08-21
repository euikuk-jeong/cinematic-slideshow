import { render } from '@testing-library/react-native';

import App from '../App';

test('renders placeholder screen', async () => {
  const { getByText } = await render(<App />);
  expect(getByText('Open up App.tsx to start working on your app!')).toBeTruthy();
});
