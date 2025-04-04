<?php

namespace Tests\Unit\Middleware;

use App\Http\Middleware\TrustHosts;
use Illuminate\Http\Request;
use Tests\TestCase;

class TrustHostsTest extends TestCase
{
    /**
     * Test that the middleware allows trusted hosts.
     *
     * @return void
     */
    public function test_allows_trusted_hosts()
    {
        // Create the middleware
        $middleware = new TrustHosts($this->app);

        // Create a request with a trusted host
        $request = Request::create('https://example.com');
        $request->headers->set('Host', 'example.com');

        // Mock the config to return our test host as trusted
        $this->app['config']->set('app.url', 'https://example.com');

        // Call the middleware
        $response = $middleware->handle($request, function () {
            return 'proceeded';
        });

        // Assert that the response is the closure result
        $this->assertEquals('proceeded', $response);
    }

    /**
     * Test that the middleware rejects untrusted hosts.
     *
     * @return void
     */
    public function test_rejects_untrusted_hosts()
    {
        // Create the middleware
        $middleware = new TrustHosts($this->app);

        // Create a request with an untrusted host
        $request = Request::create('https://malicious-site.com');
        $request->headers->set('Host', 'malicious-site.com');

        // Mock the config to return a different trusted host
        $this->app['config']->set('app.url', 'https://example.com');

        // Expect an exception to be thrown
        $this->expectException(\Illuminate\Http\Exceptions\TrustProxiesException::class);

        // Call the middleware
        $middleware->handle($request, function () {
            return 'should not reach here';
        });
    }
} 