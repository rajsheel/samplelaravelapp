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

        // Mock the Broadcast facade
        $this->mock(Broadcast::class, function ($mock) {
            $mock->shouldReceive('routes')->once();
        });

        // Call the boot method
        $provider->boot();

        // If we reach here, the test passed
        $this->assertTrue(true);
    }
} 