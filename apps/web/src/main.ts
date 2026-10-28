import { mount } from 'svelte';
import './styles/tokens.css';
// Fonts: './styles/fonts.css' is a build-time alias (see vite.config.ts) that
// resolves to fonts-static.css (latin + latin-ext only) in the static build, or
// fonts-full.css (every fontsource subset) otherwise — picked with a plain static
// import so the unused side never reaches the bundle (unlike a runtime branch).
import './styles/fonts.css';
import App from './App.svelte';

const target = document.getElementById('app')!;
mount(App, { target });
