# 👋 Welcome to HomeInventory!

First off, thank you so much for taking the time to contribute! 🎉 

HomeInventory is a powerful, real-world application with features like authentication, secure encrypted data handling, media uploads, and a highly localized interface. Because of this, every contribution—whether it's fixing a typo, squashing a bug, or building a brand-new feature—has a huge impact on our users.

We want to make your contributing experience as smooth and enjoyable as possible. Here is a quick guide to help you get started.

## 🤔 Before You Start

- **Look around:** Check the existing issues and pull requests to see if someone is already working on something similar.
- **Let's talk:** If you're planning a massive change, a new architecture, or a big feature, please open an issue first! We'd love to chat about it before you invest a ton of your valuable time coding.
- **Security first:** If you've found a security vulnerability, please *don't* open a public issue. Check out our [`SECURITY.md`](SECURITY.md) for the safe reporting process.

## 🛠️ Development Setup

Getting the project running locally is easy:

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Set up your local environment:**
   ```bash
   cp .env.example .env
   ```

3. **Fire it up:**
   ```bash
   npm run dev
   ```

Your frontend will be happily running on `http://localhost:5173` and the backend API on `http://localhost:3001`. 

*(Prefer Docker? We've got you covered! Check out `DOCKER.md` for container-based setup instructions.)*

## 🧪 Testing Your Magic

We love tests! Whenever possible, please run tests to ensure your changes are solid:

```bash
npm run test:encryption
npm run test:runtime-secrets
```

*Did you change something visual or complex?* (Like UI behavior, auth, uploads, translations, or admin flows). If so, please add some quick notes in your pull request about how you manually tested it. We appreciate the extra care!

## 💡 A Few Friendly Guidelines

- **Keep it focused:** Try to keep your pull requests small and focused on one specific issue. It makes reviewing faster and easier!
- **Keep secrets secret:** Never commit `.env` files, actual passwords, or private keys.
- **Don't break the past:** Try to keep backward compatibility for existing data and APIs. If a breaking change is needed, let's coordinate it together.
- **Update the map:** If your PR changes how things work or how to set things up, please update the docs.
- **Mind the language:** We support many languages! If you're adding new text to the UI, just leave a little note in your PR so we know translations are needed.

## 🎨 Code Style

- Try to blend in! Follow the existing style and structure of the codebase.
- Reusing existing utilities is always preferred over reinventing the wheel.
- Add comments when your logic is doing something particularly clever or non-obvious. You'll thank yourself later!

## 🚀 Pull Request Expectations

When you're ready to open a PR, please ensure you include:
- A clear, friendly summary of what you changed and why.
- Screenshots or quick videos if you changed the UI (we love seeing what you built!).
- A little note on how you tested it.

## 💬 Let's be Kind

Constructive discussions are the heart of open source. Please always assume good intent, keep your feedback specific and helpful, and let's work together to make HomeInventory the best it can be. 

Happy coding! ✨
