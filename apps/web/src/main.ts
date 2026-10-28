import { mount } from 'svelte';
import './styles/tokens.css';
import App from './App.svelte';

const target = document.getElementById('app')!;
mount(App, { target });
