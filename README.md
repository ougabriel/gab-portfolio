# gab-portfolio
My DevOps Portfolio Webpage

# Portfolio Website

A modern portfolio website built with React, TypeScript, and Tailwind CSS.

## Prerequisites

- Node.js (v18.16.0 or higher)
- npm (v9.8.1 or higher)
- Git

## Local Development

1. Clone the repository:
```bash
git clone <your-repository-url>
cd project/portfolio
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```env
VITE_API_KEY=vite_portfolio_0d45845f117dfff1b260f3cf8230e5cfea60637d386bc8d3c6ce61a92545736e
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

## Deployment to Netlify

### Method 1: Deploy via Netlify UI

1. Push your code to GitHub/GitLab/Bitbucket

2. Go to [Netlify Dashboard](https://app.netlify.com)

3. Click "Add new site" > "Import an existing project"

4. Connect to your Git provider and select the repository

5. Configure the build settings:
   - Base directory: `project`
   - Build command: `npm run build`
   - Publish directory: `dist`

6. Add environment variables:
   - Go to Site settings > Environment variables
   - Add the following variable:
     ```
     Key: VITE_API_KEY
     Value: vite_portfolio_0d45845f117dfff1b260f3cf8230e5cfea60637d386bc8d3c6ce61a92545736e
     ```

7. Click "Deploy site"

### Method 2: Deploy via Netlify CLI

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Login to Netlify:
```bash
netlify login
```

3. Initialize Netlify in your project:
```bash
netlify init
```

4. Deploy:
```bash
netlify deploy --prod
```

## Project Structure

```
project/portfolio/
├── src/
│   ├── components/     # React components
│   ├── assets/        # Static assets
│   ├── App.tsx        # Main App component
│   └── main.tsx       # Entry point
├── public/            # Public assets
├── dist/             # Build output
├── .env              # Environment variables
├── netlify.toml      # Netlify configuration
└── package.json      # Project dependencies
```

## Environment Variables

Required environment variables:
- `VITE_API_KEY`: API key for authentication

## Build Commands

- Development: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`

## Troubleshooting

### Local Development Issues

1. If you see TypeScript errors:
   ```bash
   npm run build
   ```

2. If dependencies are missing:
   ```bash
   npm install
   ```

### Netlify Deployment Issues

1. If the build fails:
   - Check the build logs in Netlify dashboard
   - Verify environment variables are set correctly
   - Ensure the base directory is set to `project/portfolio`

2. If the site is blank:
   - Check the browser console for errors
   - Verify the publish directory is set to `dist`
   - Check if all environment variables are set correctly

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


