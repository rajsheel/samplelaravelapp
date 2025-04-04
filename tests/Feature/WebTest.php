<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Web Routes Test
 * 
 * This test class verifies the functionality of the web routes.
 * It tests the response status codes and content.
 */
class WebTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test that the home page returns a 200 status code.
     * 
     * @return void
     */
    public function test_home_page_returns_200(): void
    {
        // Make a request to the home page
        $response = $this->get('/');

        // Assert that the response has a 200 status code
        $response->assertStatus(200);
    }

    /**
     * Test that the home page contains the expected content.
     * 
     * @return void
     */
    public function test_home_page_contains_expected_content(): void
    {
        // Make a request to the home page
        $response = $this->get('/');

        // Assert that the response contains the expected content
        $response->assertSee('Laravel');
    }

    /**
     * Test that non-existent routes return a 404 status code.
     * 
     * @return void
     */
    public function test_non_existent_routes_return_404(): void
    {
        // Make a request to a non-existent route
        $response = $this->get('/non-existent');

        // Assert that the response has a 404 status code
        $response->assertStatus(404);
    }
} 