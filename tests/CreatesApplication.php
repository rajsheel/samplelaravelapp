<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;

/**
 * Creates Application Trait
 * 
 * This trait provides the functionality to create a new Laravel application instance
 * for testing purposes. It is used by the TestCase class to bootstrap the application.
 * 
 * The trait is responsible for:
 * 1. Creating a new application instance
 * 2. Bootstrapping the application kernel
 * 3. Returning the application instance for testing
 */
trait CreatesApplication
{
    /**
     * Creates the application.
     * 
     * This method creates a new Laravel application instance and bootstraps it
     * for testing. It loads the application from the bootstrap/app.php file and
     * bootstraps the kernel to prepare the application for testing.
     *
     * @return \Illuminate\Foundation\Application
     */
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';

        $app->make(Kernel::class)->bootstrap();

        return $app;
    }
}
