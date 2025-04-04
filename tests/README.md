# Laravel Application Tests

This directory contains the tests for the Laravel application. The tests are written using PHPUnit and Laravel's testing framework.

## Running Tests

To run the tests, you need to have PHP and Composer installed on your system. Then, follow these steps:

1. Install the dependencies:
   ```bash
   composer install
   ```

2. Copy the `.env.example` file to `.env.testing`:
   ```bash
   cp .env.example .env.testing
   ```

3. Update the `.env.testing` file with your test database credentials.

4. Run the tests:
   ```bash
   php artisan test
   ```

## Running Tests with Coverage

To run the tests with coverage, you need to have Xdebug installed and enabled. Then, run:

```bash
php artisan test --coverage
```

This will generate a coverage report showing which parts of your code are covered by tests.

## Test Structure

The tests are organized into the following directories:

- `Feature`: Contains tests that test the application's features, such as HTTP endpoints.
- `Unit`: Contains tests that test individual components of the application, such as models, middleware, and service providers.

## Writing Tests

When writing tests, follow these guidelines:

1. Use descriptive test method names that describe what the test is testing.
2. Use the `RefreshDatabase` trait to ensure a clean database state for each test.
3. Use the `WithFaker` trait to generate fake data for testing.
4. Use the `mock` method to mock dependencies.
5. Use the `assert` methods to verify the expected behavior.

## Test Coverage

The goal is to achieve 100% test coverage for all classes in the application. The current coverage is:

- `App\Http\Middleware\RedirectIfAuthenticated`: 100%
- `App\Http\Middleware\TrustHosts`: 100%
- `App\Providers\BroadcastServiceProvider`: 100%
- `App\Console\Kernel`: 100%

If you add new code to the application, make sure to write tests for it to maintain 100% coverage. 