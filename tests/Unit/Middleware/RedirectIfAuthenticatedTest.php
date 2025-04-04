<?php

namespace Tests\Unit\Middleware;

use App\Http\Middleware\RedirectIfAuthenticated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class RedirectIfAuthenticatedTest extends TestCase
{
    /**
     * Test that the middleware redirects authenticated users to the home page.
     *
     * @return void
     */
    public function test_redirects_authenticated_users_to_home()
    {
        // Mock the Auth facade
        $this->mock(Auth::class, function ($mock) {
            $mock->shouldReceive('check')->once()->andReturn(true);
            $mock->shouldReceive('user')->once()->andReturn(new \App\Models\User());
        });

        // Create a request
        $request = new Request();

        // Create the middleware
        $middleware = new RedirectIfAuthenticated();

        // Call the middleware
        $response = $middleware->handle($request, function () {
            return 'should not reach here';
        });

        // Assert that the response is a redirect to the home page
        $this->assertEquals(redirect('/'), $response);
    }

    /**
     * Test that the middleware allows unauthenticated users to proceed.
     *
     * @return void
     */
    public function test_allows_unauthenticated_users_to_proceed()
    {
        // Mock the Auth facade
        $this->mock(Auth::class, function ($mock) {
            $mock->shouldReceive('check')->once()->andReturn(false);
        });

        // Create a request
        $request = new Request();

        // Create the middleware
        $middleware = new RedirectIfAuthenticated();

        // Call the middleware
        $response = $middleware->handle($request, function () {
            return 'proceeded';
        });

        // Assert that the response is the closure result
        $this->assertEquals('proceeded', $response);
    }
} 