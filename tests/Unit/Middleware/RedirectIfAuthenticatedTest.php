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
        // Create a mock for the Auth facade
        $authMock = $this->getMockBuilder(Auth::class)
            ->disableOriginalConstructor()
            ->getMock();
        
        // Set up the mock to return true for check() and a user for user()
        $authMock->method('check')->willReturn(true);
        $authMock->method('user')->willReturn(new \App\Models\User());
        
        // Replace the Auth facade with our mock
        $this->app->instance(Auth::class, $authMock);

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
        // Create a mock for the Auth facade
        $authMock = $this->getMockBuilder(Auth::class)
            ->disableOriginalConstructor()
            ->getMock();
        
        // Set up the mock to return false for check()
        $authMock->method('check')->willReturn(false);
        
        // Replace the Auth facade with our mock
        $this->app->instance(Auth::class, $authMock);

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