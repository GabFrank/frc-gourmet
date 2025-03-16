# FRC Gourmet

A modern Electron Angular desktop application for restaurant inventory management, product cataloging, and point of sale operations.

## Features

- **Product Management**: Comprehensive system for managing products, categories, and subcategories
- **Inventory Control**: Keep track of stock, set reorder points, and manage product expiration
- **User Management**: Secure multi-user system with role-based access control
- **Profile Management**: Create and manage customer and employee profiles
- **Image Handling**: Store product and profile images locally with the app
- **Responsive UI**: Modern, user-friendly interface built with Angular Material

## Tech Stack

- **Frontend**: Angular 15 with TypeScript
- **UI Framework**: Angular Material
- **Desktop Framework**: Electron
- **Database**: SQLite with TypeORM
- **Build Tools**: Angular CLI, Electron Builder

## Development

### Prerequisites

- Node.js 14+ and npm
- Angular CLI (`npm install -g @angular/cli`)

### Getting Started

1. Clone the repository
   ```
   git clone https://github.com/GabFrank/frc-gourmet.git
   cd frc-gourmet
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Run the development server
   ```
   npm run start
   ```

4. Start Electron
   ```
   npm run electron
   ```

### Building for Production

1. Build the Angular application
   ```
   npm run build:prod
   ```

2. Package the Electron application
   ```
   npm run electron:build
   ```

## Project Structure

- **src/app/pages/**: Angular components organized by feature
  - **personas/**: Customer and employee management
  - **productos/**: Product, category, and subcategory management
- **src/app/database/**: Database configuration and entity definitions
- **src/app/services/**: Application services
- **electron/**: Electron main process code and utilities

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

Project Link: [https://github.com/GabFrank/frc-gourmet](https://github.com/GabFrank/frc-gourmet)
