<?php

namespace Tests\Unit;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Example Unit Test
 * 
 * This test class demonstrates basic unit testing in Laravel.
 * Unit tests focus on testing individual components of the
 * application in isolation.
 * 
 * The test uses the RefreshDatabase trait to ensure a clean
 * database state for each test, although this example test
 * doesn't actually use the database.
 */
class ExampleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A basic unit test example.
     * 
     * This test demonstrates the basic structure of a unit test
     * in Laravel. It's a simple assertion that always passes,
     * serving as a template for more complex unit tests.
     *
     * @return void
     */
    public function test_example(): void
    {
        $this->assertTrue(true);
    }
}
