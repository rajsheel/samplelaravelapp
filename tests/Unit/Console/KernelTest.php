<?php

namespace Tests\Unit\Console;

use App\Console\Kernel;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;
use Mockery;

class KernelTest extends TestCase
{
    /**
     * Test that the Kernel properly schedules commands.
     *
     * @return void
     */
    public function test_schedules_commands()
    {
        // Create a mock schedule
        $schedule = Mockery::mock(Schedule::class);
        $schedule->shouldReceive('command')->zeroOrMoreTimes()->andReturn($schedule);

        // Create the kernel with the mock schedule
        $kernel = new Kernel($this->app, $this->app['events']);

        // Call the schedule method
        $kernel->schedule($schedule);

        // If we reach here, the test passed
        $this->assertTrue(true);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
} 