<?php

namespace Tests\Unit\Providers;

use App\Providers\BroadcastServiceProvider;
use Illuminate\Support\Facades\Broadcast;
use Tests\TestCase;

class BroadcastServiceProviderTest extends TestCase
{
    /**
     * Test that the BroadcastServiceProvider bootstraps broadcasting.
     *
     * @return void
     */
    public function test_bootstraps_broadcasting()
    {
        // Create the provider
        $provider = new BroadcastServiceProvider($this->app);

        // Create a mock for the Broadcast facade
        $broadcastMock = $this->getMockBuilder(Broadcast::class)
            ->disableOriginalConstructor()
            ->getMock();
        
        // Set up the mock to expect routes() to be called once
        $broadcastMock->expects($this->once())
            ->method('routes');
        
        // Replace the Broadcast facade with our mock
        $this->app->instance(Broadcast::class, $broadcastMock);

        // Call the boot method
        $provider->boot();

        // If we reach here, the test passed
        $this->assertTrue(true);
    }
} 