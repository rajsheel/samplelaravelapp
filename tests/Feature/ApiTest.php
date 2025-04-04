<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * API Test
 * 
 * This test class verifies the functionality of the API endpoints.
 * It tests the authentication, authorization, and response format.
 */
class ApiTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    /**
     * Test that the API returns a 401 status code when not authenticated.
     * 
     * @return void
     */
    public function test_api_returns_401_when_not_authenticated(): void
    {
        // Make a request to the /api/user endpoint without authentication
        $response = $this->getJson('/api/user');

        // Assert that the response has a 401 status code
        $response->assertStatus(401);
    }

    /**
     * Test that the API returns the authenticated user when authenticated.
     * 
     * @return void
     */
    public function test_api_returns_authenticated_user(): void
    {
        // Create a user
        $user = User::factory()->create();

        // Authenticate the user
        Sanctum::actingAs($user);

        // Make a request to the /api/user endpoint
        $response = $this->getJson('/api/user');

        // Assert that the response has a 200 status code
        $response->assertStatus(200);

        // Assert that the response contains the user's data
        $response->assertJson([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ]);

        // Assert that the response does not contain sensitive data
        $response->assertJsonMissing([
            'password',
            'remember_token',
        ]);
    }

    /**
     * Test that the API returns a 404 status code for non-existent endpoints.
     * 
     * @return void
     */
    public function test_api_returns_404_for_non_existent_endpoints(): void
    {
        // Create a user
        $user = User::factory()->create();

        // Authenticate the user
        Sanctum::actingAs($user);

        // Make a request to a non-existent endpoint
        $response = $this->getJson('/api/non-existent');

        // Assert that the response has a 404 status code
        $response->assertStatus(404);
    }
} 