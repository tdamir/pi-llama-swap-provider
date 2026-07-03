# pi-llama-swap-provider

A [pi](https://github.com/earendil-works/pi) package that registers [llama-swap](https://github.com/mostlygeek/llama-swap) as an OpenAI-compatible LLM provider.

It dynamically discovers available models from your local llama-swap instance at startup and makes them available to the pi coding agent.

## Features

- **Auto-discovery** — Fetches the full model list from llama-swap's `/models` API on load
- **OpenAI-compatible** — Uses the `openai-completions` API format, so it works with any OpenAI-style client
- **Smart inference** — Detects reasoning models (e.g. `*-think`, `*.think`) and vision capabilities from model metadata
- **Configurable URL** — Set your llama-swap server address via settings or the `/llama-swap-url` command
- **Hot-reload** — Changes apply automatically on `/reload`

## Prerequisites

- [pi](https://github.com/earendil-works/pi) installed
- [llama-swap](https://github.com/braely/llama-swap) running on your network

## Installation

Install via `pi install`:

```bash
pi install git:github.com/tdamir/pi-llama-swap-provider
```

To try it without installing, use the `--extension` flag:

```bash
pi --extension git:github.com/tdamir/pi-llama-swap-provider
```

## Configuration

### Setting the llama-swap URL

By default, the provider connects to `http://localhost:9292/v1`. To change it:

1. Run the interactive command:
   ```
   /llama-swap-url
   ```
   Then enter your llama-swap base URL (without `/v1`).

2. Or edit `~/.pi/agent/settings.json` directly:
   ```json
   {
     "llamaSwap": {
       "baseUrl": "http://your-server:8080"
     }
   }
   ```

The provider will automatically append `/v1` to the base URL.

### Project-scoped configuration

Use `-l` with `pi install` to write to `.pi/settings.json` (project scope) instead:

```bash
pi install -l git:github.com/tdamir/pi-llama-swap-provider
```

This is useful for sharing configuration with your team.

## llama-swap model configuration

This provider relies on llama-swap's `capabilities` section in `config.yaml` to report model metadata such as context length, input modalities, and tool support. Make sure your llama-swap config defines `capabilities` for each model so that information like context window size is properly handled:

```yaml
models:
  "your-model":
    capabilities:
      in:
        - text
        - image
      out:
        - text
      context: 128000
```

See the [llama-swap config example](https://github.com/mostlygeek/llama-swap/blob/main/config.example.yaml) for the full list of available capabilities.

## Usage

After installation and a `/reload`, models from your llama-swap instance will be available as the `llama-swap` provider in pi. Select it like any other provider when chatting with the agent.

## Development

```bash
# Install dependencies
npm install

# Run locally without installing
pi -e ./extensions/llama-swap-provider
```

## License

MIT
